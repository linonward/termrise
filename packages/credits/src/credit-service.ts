import { and, desc, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";

import type { Database } from "@repo/db/client";
import {
  creditTransactions,
  purchases,
  subscriptions,
  user,
} from "@repo/db/schema";
import { AppError } from "@repo/observability/errors";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Ledger = typeof creditTransactions.$inferSelect;
type Entry = Pick<Ledger, "userId" | "type" | "amount" | "idempotencyKey"> &
  Partial<
    Pick<Ledger, "taskId" | "purchaseId" | "subscriptionId" | "description">
  >;
export type CreditErrorCode =
  | "INVALID_CREDIT_AMOUNT"
  | "INVALID_CREDIT_OPERATION"
  | "CREDIT_RESOURCE_NOT_FOUND"
  | "INSUFFICIENT_CREDITS"
  | "IDEMPOTENCY_CONFLICT";
export class CreditError extends Error {
  constructor(public code: CreditErrorCode) {
    super(code);
  }
}
function amount(value: number) {
  if (!Number.isInteger(value) || value === 0 || Math.abs(value) > 2147483647)
    throw new CreditError("INVALID_CREDIT_AMOUNT");
}

/** All mutations can join a caller transaction via createCreditService(tx). */
export function createCreditService(database: Database | Transaction) {
  async function getBalance(userId: string) {
    const [row] = await database
      .select({ balance: user.creditBalance })
      .from(user)
      .where(eq(user.id, userId));
    if (!row) throw new CreditError("CREDIT_RESOURCE_NOT_FOUND");
    return row.balance;
  }
  async function locked<T>(
    userId: string,
    fn: (tx: Transaction, balance: number) => Promise<T>,
  ) {
    return database.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(user)
        .where(eq(user.id, userId))
        .for("no key update");
      if (!row) throw new CreditError("CREDIT_RESOURCE_NOT_FOUND");
      return fn(tx, row.creditBalance);
    });
  }
  async function existing(tx: Transaction, key: string) {
    const [entry] = await tx
      .select()
      .from(creditTransactions)
      .where(eq(creditTransactions.idempotencyKey, key));
    return entry;
  }
  async function post(tx: Transaction, entry: Entry): Promise<Ledger> {
    amount(entry.amount);
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${entry.idempotencyKey}, 0))`,
    );
    const previous = await existing(tx, entry.idempotencyKey);
    if (previous) {
      if (
        previous.userId !== entry.userId ||
        previous.amount !== entry.amount ||
        previous.type !== entry.type
      )
        throw new CreditError("IDEMPOTENCY_CONFLICT");
      return previous;
    }
    // Conditional SQL remains the final guard even when participating in an outer transaction.
    const [updated] = await tx
      .update(user)
      .set({ creditBalance: sql`${user.creditBalance} + ${entry.amount}` })
      .where(
        and(
          eq(user.id, entry.userId),
          gte(user.creditBalance, Math.max(0, -entry.amount)),
        ),
      )
      .returning();
    if (!updated) throw new CreditError("INSUFFICIENT_CREDITS");
    const [row] = await tx
      .insert(creditTransactions)
      .values({ ...entry, balanceAfter: updated.creditBalance })
      .returning();
    return row;
  }
  /** Once per user; the product decides the amount (product.config.ts). */
  const grantSignupBonus = (userId: string, amount: number) =>
    grant({
      userId,
      type: "SIGNUP_BONUS",
      amount,
      idempotencyKey: `user:${userId}:signup-bonus`,
    });
  /** Takes `amount` once per idempotency key; INSUFFICIENT_CREDITS when the balance is short. */
  async function debit(entry: Entry) {
    if (entry.amount <= 0) throw new CreditError("INVALID_CREDIT_AMOUNT");
    return locked(entry.userId, (tx) =>
      post(tx, { ...entry, amount: -entry.amount }),
    );
  }
  /** Gives back the whole debit at `debitKey`, once per idempotency key. */
  async function refund({
    debitKey,
    ...entry
  }: Omit<Entry, "amount"> & { debitKey: string }) {
    return locked(entry.userId, async (tx) => {
      const original = await existing(tx, debitKey);
      if (!original || original.userId !== entry.userId || original.amount >= 0)
        throw new CreditError("INVALID_CREDIT_OPERATION");
      return post(tx, { ...entry, amount: -original.amount });
    });
  }
  /** Adds `amount` once per idempotency key. Lock the business record first. */
  async function grant(entry: Entry) {
    if (entry.amount <= 0) throw new CreditError("INVALID_CREDIT_AMOUNT");
    return locked(entry.userId, (tx) => post(tx, entry));
  }
  /**
   * Takes back up to `credits` once per idempotency key, bounded by the balance:
   * the shortfall is what the balance could not cover. No entry when nothing is taken.
   */
  async function reverse({
    credits,
    ...entry
  }: Omit<Entry, "amount"> & { credits: number }) {
    if (!Number.isInteger(credits) || credits <= 0)
      throw new CreditError("INVALID_CREDIT_AMOUNT");
    return locked(entry.userId, async (tx, balance) => {
      const previous = await existing(tx, entry.idempotencyKey);
      if (previous) {
        if (previous.userId !== entry.userId || previous.type !== entry.type)
          throw new CreditError("IDEMPOTENCY_CONFLICT");
        return { transaction: previous, shortfall: credits + previous.amount };
      }
      const amount = Math.min(credits, balance);
      const transaction =
        amount > 0 ? await post(tx, { ...entry, amount: -amount }) : null;
      return { transaction, shortfall: credits - amount };
    });
  }
  async function findEntry(idempotencyKey: string) {
    const [entry] = await database
      .select()
      .from(creditTransactions)
      .where(eq(creditTransactions.idempotencyKey, idempotencyKey));
    return entry;
  }
  async function adminAdjust(
    userId: string,
    value: number,
    id: string,
    description: string,
  ) {
    amount(value);
    if (!z.uuid().safeParse(id).success || !description.trim())
      throw new CreditError("INVALID_CREDIT_OPERATION");
    return locked(userId, (tx) =>
      post(tx, {
        userId,
        type: "ADMIN_ADJUSTMENT",
        amount: value,
        idempotencyKey: `admin:${id}`,
        description,
      }),
    );
  }
  // User-facing ledger page. Cursor = id of the last item; (created_at, id)
  // ordering keeps pages exact when timestamps tie. The admin description is
  // internal and never selected here.
  async function listActivity(userId: string, cursor?: string, limit = 20) {
    if (cursor !== undefined) {
      const owned =
        z.uuid().safeParse(cursor).success &&
        (await database
          .select({ id: creditTransactions.id })
          .from(creditTransactions)
          .where(
            and(
              eq(creditTransactions.id, cursor),
              eq(creditTransactions.userId, userId),
            ),
          )
          .then((rows) => rows.length > 0));
      if (!owned) throw new AppError("INVALID_INPUT", "Invalid cursor");
    }
    const rows = await database
      .select({
        id: creditTransactions.id,
        type: creditTransactions.type,
        amount: creditTransactions.amount,
        balanceAfter: creditTransactions.balanceAfter,
        createdAt: creditTransactions.createdAt,
        taskId: creditTransactions.taskId,
        packId: purchases.packId,
        planId: subscriptions.planId,
      })
      .from(creditTransactions)
      .leftJoin(purchases, eq(purchases.id, creditTransactions.purchaseId))
      .leftJoin(
        subscriptions,
        eq(subscriptions.id, creditTransactions.subscriptionId),
      )
      .where(
        and(
          eq(creditTransactions.userId, userId),
          cursor
            ? sql`(${creditTransactions.createdAt}, ${creditTransactions.id}) < (select created_at, id from credit_transactions where id = ${cursor})`
            : undefined,
        ),
      )
      .orderBy(desc(creditTransactions.createdAt), desc(creditTransactions.id))
      .limit(limit + 1);
    const items = rows.slice(0, limit);
    return {
      items,
      nextCursor: rows.length > limit ? items[items.length - 1].id : null,
    };
  }
  return {
    getBalance,
    listActivity,
    findEntry,
    grant,
    reverse,
    grantSignupBonus,
    adminAdjust,
    debit,
    refund,
  };
}
