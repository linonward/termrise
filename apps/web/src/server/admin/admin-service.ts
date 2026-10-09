import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import {
  CreditError,
  createCreditService,
  type CreditErrorCode,
} from "@repo/credits/credit-service";
import type { Database } from "@repo/db/client";
import { creditTransactions, purchases, user } from "@repo/db/schema";

// Admin console reads and the one admin write (docs/architecture/security.md#admin-access).
// Balances still change only through CreditService.

/** Largest single adjustment; bigger changes need several, each with a reason. */
export const ADJUST_LIMIT = 1000;
const LIST_LIMIT = 20;

export type AdminErrorCode =
  | "INVALID_INPUT"
  | "INVALID_AMOUNT"
  | "INVALID_REASON"
  | "USER_NOT_FOUND"
  | "INSUFFICIENT_CREDITS"
  | "IDEMPOTENCY_CONFLICT";

export class AdminError extends Error {
  constructor(public code: AdminErrorCode) {
    super(code);
  }
}

const adjustInput = z.object({
  actorId: z.string().min(1),
  userId: z.string().min(1),
  amount: z.number(),
  id: z.uuid(),
  reason: z.string(),
});

// Credit errors an admin can cause; the rest stay internal errors.
const CREDIT_ERRORS: Partial<Record<CreditErrorCode, AdminErrorCode>> = {
  CREDIT_RESOURCE_NOT_FOUND: "USER_NOT_FOUND",
  INSUFFICIENT_CREDITS: "INSUFFICIENT_CREDITS",
  IDEMPOTENCY_CONFLICT: "IDEMPOTENCY_CONFLICT",
};

/** What the admin console shows of a paid record (a Task in the starter). */
export type PaidRecord = {
  id: string;
  createdAt: Date;
  status: string;
  creditsCost: number;
  errorCode: string | null;
};

export function createAdminService<R extends PaidRecord>(
  database: Database,
  deps: {
    /** The product's paid records, newest first (TaskService.list in the starter). */
    listTasks: (userId: string, limit: number) => Promise<R[]>;
  },
) {
  /** Email (any case) or exact user id. */
  async function findUserId(query: string) {
    const value = query.trim();
    if (!value) return null;
    const [row] = await database
      .select({ id: user.id })
      .from(user)
      .where(
        value.includes("@")
          ? eq(sql`lower(${user.email})`, value.toLowerCase())
          : eq(user.id, value),
      )
      .limit(1);
    return row?.id ?? null;
  }

  async function getUserOverview(userId: string) {
    const [row] = await database
      .select({
        id: user.id,
        email: user.email,
        name: user.name,
        createdAt: user.createdAt,
        creditBalance: user.creditBalance,
      })
      .from(user)
      .where(eq(user.id, userId));
    if (!row) return null;
    const [[sum], transactions, userTasks, userPurchases] = await Promise.all([
      database
        .select({
          total: sql<string>`coalesce(sum(${creditTransactions.amount}), 0)`,
        })
        .from(creditTransactions)
        .where(eq(creditTransactions.userId, userId)),
      database
        .select()
        .from(creditTransactions)
        .where(eq(creditTransactions.userId, userId))
        .orderBy(
          desc(creditTransactions.createdAt),
          desc(creditTransactions.id),
        )
        .limit(LIST_LIMIT),
      deps.listTasks(userId, LIST_LIMIT),
      database
        .select()
        .from(purchases)
        .where(eq(purchases.userId, userId))
        .orderBy(desc(purchases.createdAt), desc(purchases.id))
        .limit(LIST_LIMIT),
    ]);
    return {
      user: row,
      // Must equal creditBalance (docs/architecture/data-model.md#credit-invariants).
      ledgerSum: Number(sum.total),
      transactions,
      tasks: userTasks,
      purchases: userPurchases,
    };
  }

  /** Idempotent per id: a resubmitted form never adjusts twice. */
  async function adjustCredits(input: {
    actorId: string;
    userId: string;
    amount: number;
    id: string;
    reason: string;
  }) {
    const parsed = adjustInput.safeParse(input);
    if (!parsed.success) throw new AdminError("INVALID_INPUT");
    const { actorId, userId, amount, id } = parsed.data;
    const reason = parsed.data.reason.trim();
    if (
      !Number.isInteger(amount) ||
      amount === 0 ||
      Math.abs(amount) > ADJUST_LIMIT
    )
      throw new AdminError("INVALID_AMOUNT");
    if (!reason) throw new AdminError("INVALID_REASON");
    const credits = createCreditService(database);
    try {
      const entry = await credits.adminAdjust(
        userId,
        amount,
        id,
        `[by ${actorId}] ${reason}`,
      );
      return {
        transactionId: entry.id,
        balance: await credits.getBalance(userId),
      };
    } catch (error) {
      const code = error instanceof CreditError && CREDIT_ERRORS[error.code];
      if (code) throw new AdminError(code);
      throw error;
    }
  }

  return { findUserId, getUserOverview, adjustCredits };
}
