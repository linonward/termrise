import { randomUUID } from "node:crypto";

import { afterAll, beforeEach, expect, it } from "vitest";

import {
  creditTransactions,
  tasks,
  purchases,
  subscriptions,
  user,
} from "@repo/db/schema";
import { closeTestDb, resetDb, testDb } from "@repo/db/testing/db";

import { toCreditActivityDto } from "./credit-activity";
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

async function code(promise: Promise<unknown>) {
  return promise.then(
    () => null,
    (error: { code?: string }) => error.code,
  );
}

async function insertLedger(userId: string, count: number, createdAt?: Date) {
  return db
    .insert(creditTransactions)
    .values(
      Array.from({ length: count }, (_, i) => ({
        userId,
        type: "ADMIN_ADJUSTMENT" as const,
        amount: 1,
        balanceAfter: i + 1,
        idempotencyKey: `admin:${randomUUID()}`,
        description: `row ${i}`,
        createdAt: createdAt ?? new Date(Date.UTC(2026, 9, 1, 0, i)),
      })),
    )
    .returning({ id: creditTransactions.id });
}

it("lists the user's ledger newest first with task and pack details", async () => {
  await credits.grantSignupBonus("a", 10);
  await credits.grantSignupBonus("b", 10);
  const [p] = await db
    .insert(purchases)
    .values({
      userId: "a",
      provider: "fake",
      packId: "starter",
      amountUsd: 1990,
      credits: 50,
      status: "PAID",
    })
    .returning();
  await credits.grant({
    userId: "a",
    purchaseId: p.id,
    type: "PURCHASE",
    amount: p.credits,
    idempotencyKey: `purchase:${p.id}:credit`,
  });
  const [{ id: taskId }] = await db
    .insert(tasks)
    .values({
      userId: "a",
      creditsCost: 10,
      status: "PENDING",
      requestId: randomUUID(),
      input: "test",
    })
    .returning();
  await credits.debit({
    userId: "a",
    taskId,
    type: "TASK_DEBIT",
    amount: 10,
    idempotencyKey: `task:${taskId}:debit`,
  });
  await credits.adminAdjust("a", 5, randomUUID(), "internal reason");

  const { items, nextCursor } = await credits.listActivity("a");
  expect(nextCursor).toBeNull();
  expect(
    items.map(({ type, amount, balanceAfter }) => [type, amount, balanceAfter]),
  ).toEqual([
    ["ADMIN_ADJUSTMENT", 5, 55],
    ["TASK_DEBIT", -10, 50],
    ["PURCHASE", 50, 60],
    ["SIGNUP_BONUS", 10, 10],
  ]);
  expect(items[1]).toMatchObject({
    taskId,
  });
  expect(items[2]).toMatchObject({ packId: "starter" });
  // Admin reasons are internal (docs/architecture/data-model.md#creditservice).
  expect(JSON.stringify(items)).not.toContain("internal reason");
});

it("shows the plan of a subscription grant", async () => {
  const [sub] = await db
    .insert(subscriptions)
    .values({
      userId: "a",
      provider: "fake",
      planId: "monthly",
      amountUsd: 990,
      credits: 60,
      status: "ACTIVE",
    })
    .returning();
  await credits.grant({
    userId: "a",
    subscriptionId: sub.id,
    type: "SUBSCRIPTION_GRANT",
    amount: sub.credits,
    idempotencyKey: "subscription-payment:pay_1:credit",
  });
  const { items } = await credits.listActivity("a");
  expect(toCreditActivityDto(items[0])).toMatchObject({
    type: "SUBSCRIPTION_GRANT",
    amount: 60,
    packId: null,
    planId: "monthly",
  });
});

it("pages 20 at a time without gaps or repeats when timestamps tie", async () => {
  await insertLedger("a", 25, new Date("2026-10-05T10:00:00.123456Z"));
  await insertLedger("b", 3);
  const first = await credits.listActivity("a");
  expect(first.items).toHaveLength(20);
  expect(first.nextCursor).toBe(first.items[19].id);
  const second = await credits.listActivity("a", first.nextCursor!);
  expect(second.items).toHaveLength(5);
  expect(second.nextCursor).toBeNull();
  const ids = [...first.items, ...second.items].map((t) => t.id);
  expect(new Set(ids).size).toBe(25);
});

it("rejects a cursor that is not one of the user's transactions", async () => {
  const [other] = await insertLedger("b", 1);
  expect(await code(credits.listActivity("a", other.id))).toBe("INVALID_INPUT");
  expect(await code(credits.listActivity("a", "nope"))).toBe("INVALID_INPUT");
});
