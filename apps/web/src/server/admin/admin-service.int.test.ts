import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeEach, expect, it } from "vitest";

import { createFakeAiProvider } from "@repo/ai/adapters/fake";
import { createCreditService } from "@repo/credits/credit-service";
import { creditTransactions, tasks, purchases, user } from "@repo/db/schema";
import { closeTestDb, resetDb, testDb } from "@repo/db/testing/db";

import { createTaskService } from "@/features/tasks/task-service";

import { AdminError, createAdminService } from "./admin-service";

beforeEach(resetDb);
afterAll(closeTestDb);

async function seed() {
  await testDb()
    .insert(user)
    .values([
      { id: "u1", name: "U1", email: "shop@example.com" },
      { id: "u2", name: "U2", email: "other@example.com" },
    ]);
  await createCreditService(testDb()).grantSignupBonus("u1", 10);
  const tasks = createTaskService({
    database: testDb(),
    provider: createFakeAiProvider(),
  });
  return createAdminService(testDb(), { listTasks: tasks.list });
}

const adjust = (
  amount: number,
  id: string = randomUUID(),
  reason = "refund ticket 12",
) => ({
  actorId: "admin",
  userId: "u1",
  amount,
  id,
  reason,
});

it("finds a user by email (any case) or by id", async () => {
  const admin = await seed();
  expect(await admin.findUserId("  Shop@Example.com ")).toBe("u1");
  expect(await admin.findUserId("u2")).toBe("u2");
  expect(await admin.findUserId("missing@example.com")).toBeNull();
  expect(await admin.findUserId("")).toBeNull();
});

it("shows balance, ledger sum and only the user's own records", async () => {
  const admin = await seed();
  await testDb()
    .insert(tasks)
    .values(
      ["u1", "u2"].map((userId) => ({
        userId,
        status: "SUCCEEDED" as const,
        requestId: randomUUID(),
        input: `input-${userId}`,
        creditsCost: 1,
      })),
    );
  await testDb().insert(purchases).values({
    userId: "u1",
    provider: "fake",
    packId: "starter",
    amountUsd: 900,
    credits: 100,
    status: "PENDING",
  });
  const overview = await admin.getUserOverview("u1");
  expect(overview).toMatchObject({
    user: { id: "u1", email: "shop@example.com", creditBalance: 10 },
    ledgerSum: 10,
  });
  expect(overview!.transactions.map((t) => t.type)).toEqual(["SIGNUP_BONUS"]);
  expect(overview!.tasks.map((t) => t.input)).toEqual(["input-u1"]);
  expect(overview!.purchases).toHaveLength(1);
  expect(await admin.getUserOverview("missing")).toBeNull();
});

it("reports a ledger sum that differs from the balance", async () => {
  const admin = await seed();
  // Test-only corruption: production code never writes the balance directly.
  await testDb()
    .update(user)
    .set({ creditBalance: 99 })
    .where(eq(user.id, "u1"));
  const overview = await admin.getUserOverview("u1");
  expect(overview).toMatchObject({
    user: { creditBalance: 99 },
    ledgerSum: 10,
  });
});

it("adjusts credits once per id and records who did it", async () => {
  const admin = await seed();
  const input = adjust(5);
  const first = await admin.adjustCredits(input);
  const again = await admin.adjustCredits(input);
  expect(first).toEqual({ transactionId: expect.any(String), balance: 15 });
  expect(again).toEqual(first);
  const rows = await testDb()
    .select()
    .from(creditTransactions)
    .where(eq(creditTransactions.type, "ADMIN_ADJUSTMENT"));
  expect(rows).toHaveLength(1);
  expect(rows[0].description).toBe("[by admin] refund ticket 12");
});

it("rejects invalid input before touching the ledger", async () => {
  const admin = await seed();
  for (const [input, code] of [
    [adjust(0), "INVALID_AMOUNT"],
    [adjust(1001), "INVALID_AMOUNT"],
    [adjust(-1001), "INVALID_AMOUNT"],
    [adjust(1.5), "INVALID_AMOUNT"],
    [adjust(5, "not-a-uuid"), "INVALID_INPUT"],
    [adjust(5, randomUUID(), "   "), "INVALID_REASON"],
    [{ ...adjust(5), userId: "missing" }, "USER_NOT_FOUND"],
  ] as const)
    await expect(admin.adjustCredits(input)).rejects.toEqual(
      new AdminError(code),
    );
  expect(await createCreditService(testDb()).getBalance("u1")).toBe(10);
});

it("keeps the balance when a deduction would make it negative", async () => {
  const admin = await seed();
  await expect(admin.adjustCredits(adjust(-11))).rejects.toEqual(
    new AdminError("INSUFFICIENT_CREDITS"),
  );
  expect(await createCreditService(testDb()).getBalance("u1")).toBe(10);
});

it("refuses to reuse an id for a different adjustment", async () => {
  const admin = await seed();
  const id = randomUUID();
  await admin.adjustCredits(adjust(5, id));
  await expect(admin.adjustCredits(adjust(6, id))).rejects.toEqual(
    new AdminError("IDEMPOTENCY_CONFLICT"),
  );
});
