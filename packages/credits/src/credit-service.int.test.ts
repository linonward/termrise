import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, expect, it } from "vitest";

import { user, creditTransactions } from "@repo/db/schema";
import { closeTestDb, resetDb, testDb } from "@repo/db/testing/db";

import { createCreditService } from "./credit-service";

const db = testDb();
const credits = createCreditService(db);
beforeEach(async () => {
  await resetDb();
  await db.insert(user).values([
    { id: "a", name: "A", email: "a@example.com" },
    { id: "b", name: "B", email: "b@example.com" },
  ]);
});
afterAll(closeTestDb);
async function invariant() {
  const users = await db.select().from(user);
  for (const u of users) {
    const [sum] = await db
      .select({
        total: sql<number>`coalesce(sum(${creditTransactions.amount}), 0)::int`,
      })
      .from(creditTransactions)
      .where(eq(creditTransactions.userId, u.id));
    expect(u.creditBalance).toBe(sum.total);
    expect(u.creditBalance).toBeGreaterThanOrEqual(0);
  }
}
it("grants exactly one signup bonus under concurrent retries", async () => {
  const results = await Promise.all(
    Array.from({ length: 8 }, () => credits.grantSignupBonus("a", 10)),
  );
  expect(new Set(results.map((r) => r.id)).size).toBe(1);
  expect(await credits.getBalance("a")).toBe(10);
  expect(await credits.getBalance("b")).toBe(0);
  expect(await db.select().from(creditTransactions)).toHaveLength(1);
  await invariant();
});
const debit = (key = "debit:1", amount = 10, userId = "a") =>
  credits.debit({ userId, type: "TASK_DEBIT", amount, idempotencyKey: key });
const refund = (debitKey = "debit:1", userId = "a") =>
  credits.refund({
    userId,
    type: "TASK_REFUND",
    debitKey,
    idempotencyKey: `${debitKey}:refund`,
  });
it("allows only one concurrent spend", async () => {
  await credits.grantSignupBonus("a", 10);
  const results = await Promise.allSettled([
    debit("debit:1"),
    debit("debit:2"),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(results.find((r) => r.status === "rejected")).toMatchObject({
    reason: { code: "INSUFFICIENT_CREDITS" },
  });
  expect(await credits.getBalance("a")).toBe(0);
  await invariant();
});
it("debits once per key and rejects invalid amounts", async () => {
  await credits.grantSignupBonus("a", 10);
  const [first, second] = await Promise.all([debit(), debit()]);
  expect(second.id).toBe(first.id);
  expect(first).toMatchObject({ type: "TASK_DEBIT", amount: -10 });
  for (const bad of [0, -1, 1.5])
    await expect(debit("debit:bad", bad)).rejects.toMatchObject({
      code: "INVALID_CREDIT_AMOUNT",
    });
  await invariant();
});
it("refunds only an actual debit of the same user, once", async () => {
  await credits.grantSignupBonus("a", 10);
  await expect(refund()).rejects.toMatchObject({
    code: "INVALID_CREDIT_OPERATION",
  });
  await expect(refund("user:a:signup-bonus")).rejects.toMatchObject({
    code: "INVALID_CREDIT_OPERATION",
  });
  await debit();
  await expect(refund("debit:1", "b")).rejects.toMatchObject({
    code: "INVALID_CREDIT_OPERATION",
  });
  const results = await Promise.all(Array.from({ length: 5 }, () => refund()));
  expect(new Set(results.map((r) => r.id)).size).toBe(1);
  expect(results[0]).toMatchObject({ type: "TASK_REFUND", amount: 10 });
  expect(await credits.getBalance("a")).toBe(10);
  expect(await db.select().from(creditTransactions)).toHaveLength(3);
  await invariant();
});
it("rolls back ledger and balance together with an enclosing transaction", async () => {
  await expect(
    db.transaction(async (tx) => {
      await createCreditService(tx).grantSignupBonus("a", 10);
      throw new Error("rollback");
    }),
  ).rejects.toThrow("rollback");
  expect(await credits.getBalance("a")).toBe(0);
  expect(await db.select().from(creditTransactions)).toHaveLength(0);
});
it("rejects invalid adjustments and binds idempotency to its owner", async () => {
  for (const amount of [0, 1.5, NaN, 2147483648])
    await expect(
      credits.adminAdjust("a", amount, randomUUID(), "test"),
    ).rejects.toMatchObject({ code: "INVALID_CREDIT_AMOUNT" });
  const id = randomUUID();
  await credits.adminAdjust("a", 15, id, "support correction");
  await credits.adminAdjust("a", 15, id, "support correction");
  await expect(
    credits.adminAdjust("b", 15, id, "support correction"),
  ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  await expect(
    credits.adminAdjust("a", 16, id, "support correction"),
  ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  await expect(
    credits.adminAdjust("a", -16, randomUUID(), "test"),
  ).rejects.toMatchObject({ code: "INSUFFICIENT_CREDITS" });
  await invariant();
});
it("serializes conflicting global adjustment keys across different users", async () => {
  const id = randomUUID();
  const results = await Promise.allSettled([
    credits.adminAdjust("a", 10, id, "test"),
    credits.adminAdjust("b", 10, id, "test"),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(results.find((r) => r.status === "rejected")).toMatchObject({
    reason: { code: "IDEMPOTENCY_CONFLICT" },
  });
  expect(await db.select().from(creditTransactions)).toHaveLength(1);
  await invariant();
});

const grant = (amount = 60, key = "grant:1") =>
  credits.grant({
    userId: "a",
    type: "SUBSCRIPTION_GRANT",
    amount,
    idempotencyKey: key,
  });
const reverse = (credits_: number, userId = "a") =>
  credits.reverse({
    userId,
    type: "SUBSCRIPTION_REVERSAL",
    credits: credits_,
    idempotencyKey: "reversal:1",
  });

it("grants once per idempotency key, also under concurrent retries", async () => {
  const results = await Promise.all(Array.from({ length: 5 }, () => grant()));
  expect(new Set(results.map((r) => r.id)).size).toBe(1);
  await grant(60, "grant:2");
  expect(await credits.getBalance("a")).toBe(120);
  expect(await credits.findEntry("grant:1")).toMatchObject({ amount: 60 });
  expect(await credits.findEntry("grant:3")).toBeUndefined();
  for (const bad of [0, -1, 1.5])
    await expect(grant(bad, "grant:bad")).rejects.toMatchObject({
      code: "INVALID_CREDIT_AMOUNT",
    });
  await invariant();
});

it("reverses once per key, bounded by the balance", async () => {
  await grant();
  await credits.adminAdjust("a", -40, randomUUID(), "spent");
  const results = await Promise.all([reverse(30), reverse(30)]);
  expect(results.map((r) => r.shortfall)).toEqual([10, 10]);
  expect(results[0].transaction).toMatchObject({ amount: -20 });
  expect(results[1].transaction?.id).toBe(results[0].transaction?.id);
  await credits.adminAdjust("a", 50, randomUUID(), "top-up");
  expect((await reverse(30)).transaction?.id).toBe(results[0].transaction?.id);
  expect(await credits.getBalance("a")).toBe(50);
  await expect(reverse(30, "b")).rejects.toMatchObject({
    code: "IDEMPOTENCY_CONFLICT",
  });
  await invariant();
});

it("reverses nothing on an empty balance and writes no zero entry", async () => {
  expect(await reverse(30)).toEqual({ transaction: null, shortfall: 30 });
  for (const bad of [0, -1, 1.5])
    await expect(reverse(bad)).rejects.toMatchObject({
      code: "INVALID_CREDIT_AMOUNT",
    });
  expect(await db.select().from(creditTransactions)).toHaveLength(0);
});

it("rolls back a reversal with the enclosing transaction", async () => {
  await grant();
  await expect(
    db.transaction(async (tx) => {
      await createCreditService(tx).reverse({
        userId: "a",
        type: "SUBSCRIPTION_REVERSAL",
        credits: 60,
        idempotencyKey: "reversal:1",
      });
      throw new Error("rollback reversal");
    }),
  ).rejects.toThrow("rollback reversal");
  expect(await credits.getBalance("a")).toBe(60);
  expect(await db.select().from(creditTransactions)).toHaveLength(1);
});
