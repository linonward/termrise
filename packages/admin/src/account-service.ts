import { and, asc, eq, inArray } from "drizzle-orm";

import type { Database } from "@repo/db/client";
import {
  account,
  analyticsConsents,
  creditTransactions,
  purchases,
  session,
  subscriptions,
  user,
} from "@repo/db/schema";
import { logger } from "@repo/observability/logger";
import type { ObjectStorage } from "@repo/storage/types";

// Account export and deletion for support requests (docs/runbook.md#delete-or-export-an-account).
// Deletion anonymizes the user row and keeps the ledger, purchases and subscriptions:
// the Privacy Policy keeps records the law requires. Balances do not change.

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** The product's per-user data; the app passes its own (apps/api/src/product-data.ts). */
export type ProductData = {
  /** Everything the user created in the product, for the export file. */
  export(database: Database, userId: string): Promise<Record<string, unknown>>;
  /** Erases the user's content; runs inside the deletion transaction. */
  erase(database: Database | Transaction, userId: string): Promise<void>;
};

export type AccountErrorCode = "USER_NOT_FOUND" | "ACTIVE_SUBSCRIPTION";

export class AccountError extends Error {
  constructor(public code: AccountErrorCode) {
    super(code);
  }
}

/** Statuses that can still charge the user; cancel first (docs/runbook.md#subscription-cancel-and-refund). */
const LIVE_SUBSCRIPTIONS = ["ACTIVE", "PAST_DUE", "CANCELING"] as const;

const deletedEmail = (userId: string) => `deleted-${userId}@deleted.invalid`;
const uploadPrefix = (userId: string) => `uploads/${userId}/`;

export function createAccountService(
  database: Database,
  deps: { storage: ObjectStorage; product: ProductData },
) {
  const { storage, product } = deps;

  async function findUser(userId: string) {
    const [row] = await database.select().from(user).where(eq(user.id, userId));
    if (!row) throw new AccountError("USER_NOT_FOUND");
    return row;
  }

  async function exportUser(userId: string) {
    const row = await findUser(userId);
    const [consent] = await database
      .select({
        granted: analyticsConsents.granted,
        updatedAt: analyticsConsents.updatedAt,
      })
      .from(analyticsConsents)
      .where(eq(analyticsConsents.userId, userId));
    return {
      exportedAt: new Date(),
      user: {
        id: row.id,
        email: row.email,
        name: row.name,
        image: row.image,
        createdAt: row.createdAt,
        creditBalance: row.creditBalance,
      },
      // Provider names only: tokens never leave the database.
      signInMethods: await database
        .select({
          providerId: account.providerId,
          createdAt: account.createdAt,
        })
        .from(account)
        .where(eq(account.userId, userId)),
      analyticsConsent: consent ?? null,
      creditTransactions: await database
        .select()
        .from(creditTransactions)
        .where(eq(creditTransactions.userId, userId))
        .orderBy(asc(creditTransactions.createdAt)),
      purchases: await database
        .select()
        .from(purchases)
        .where(eq(purchases.userId, userId))
        .orderBy(asc(purchases.createdAt)),
      subscriptions: await database
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.userId, userId))
        .orderBy(asc(subscriptions.createdAt)),
      product: await product.export(database, userId),
      uploads: await storage.list(uploadPrefix(userId)),
    };
  }

  async function planDeletion(userId: string) {
    const row = await findUser(userId);
    const [live] = await database
      .select({ id: subscriptions.id })
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.userId, userId),
          inArray(subscriptions.status, LIVE_SUBSCRIPTIONS),
        ),
      );
    return {
      userId,
      alreadyDeleted: row.email === deletedEmail(userId),
      activeSubscriptionId: live?.id ?? null,
      uploads: await storage.list(uploadPrefix(userId)),
    };
  }

  async function deleteUser(userId: string) {
    const plan = await planDeletion(userId);
    if (plan.activeSubscriptionId)
      throw new AccountError("ACTIVE_SUBSCRIPTION");

    await database.transaction(async (tx) => {
      await tx
        .update(user)
        .set({
          email: deletedEmail(userId),
          name: "Deleted user",
          image: null,
          emailVerified: false,
        })
        .where(eq(user.id, userId));
      await tx.delete(session).where(eq(session.userId, userId));
      await tx.delete(account).where(eq(account.userId, userId));
      await tx
        .delete(analyticsConsents)
        .where(eq(analyticsConsents.userId, userId));
      await product.erase(tx, userId);
    });
    // After the commit: a failure here leaves files, and a rerun deletes them.
    for (const key of plan.uploads) await storage.delete(key);

    logger.info("account.deleted", {
      userId,
      alreadyDeleted: plan.alreadyDeleted,
      uploadsDeleted: plan.uploads.length,
    });
    return {
      alreadyDeleted: plan.alreadyDeleted,
      uploadsDeleted: plan.uploads.length,
    };
  }

  return { exportUser, planDeletion, deleteUser };
}
