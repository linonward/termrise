import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { closeTestDb, resetDb, testDb } from "@repo/db/testing/db";

import {
  creditTransactions,
  tasks,
  paymentEvents,
  rateLimits,
  user,
} from "./schema";

const newUser = (id = "user_1") => ({
  id,
  name: "Maya",
  email: `${id}@example.com`,
});

// Postgres error codes: 23514 check_violation, 23505 unique_violation
const pgCode = async (promise: Promise<unknown>) => {
  try {
    await promise;
    return undefined;
  } catch (error) {
    return (error as { cause?: { code?: string } }).cause?.code;
  }
};

beforeEach(resetDb);
afterAll(closeTestDb);

describe("database schema", () => {
  it("applies migrations for every table", async () => {
    const { rows } = await testDb().execute<{ table_name: string }>(sql`
      select table_name from information_schema.tables where table_schema = 'public'
    `);
    expect(rows.map((r) => r.table_name)).toEqual(
      expect.arrayContaining([
        "user",
        "session",
        "account",
        "verification",
        "tasks",
        "credit_transactions",
        "purchases",
        "payment_events",
        "rate_limits",
      ]),
    );
  });

  it("inserts and selects a user with a zero credit balance by default", async () => {
    await testDb().insert(user).values(newUser());
    const [row] = await testDb()
      .select()
      .from(user)
      .where(eq(user.id, "user_1"));
    expect(row.creditBalance).toBe(0);
  });

  it("rolls back every statement when a transaction fails", async () => {
    await expect(
      testDb().transaction(async (tx) => {
        await tx.insert(user).values(newUser());
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(await testDb().select().from(user)).toHaveLength(0);
  });

  it("never lets credit_balance go negative", async () => {
    await testDb().insert(user).values(newUser());
    const code = await pgCode(
      testDb()
        .update(user)
        .set({ creditBalance: -1 })
        .where(eq(user.id, "user_1")),
    );
    expect(code).toBe("23514");
  });

  it("enforces one ledger entry per idempotency key", async () => {
    await testDb().insert(user).values(newUser());
    const entry = {
      userId: "user_1",
      type: "SIGNUP_BONUS" as const,
      amount: 10,
      balanceAfter: 10,
      idempotencyKey: "user:user_1:signup-bonus",
    };
    await testDb().insert(creditTransactions).values(entry);
    expect(
      await pgCode(testDb().insert(creditTransactions).values(entry)),
    ).toBe("23505");
  });

  it("rejects unknown task statuses", async () => {
    await testDb().insert(user).values(newUser());
    const code = await pgCode(
      testDb()
        .insert(tasks)
        .values({
          userId: "user_1",
          status: "DONE" as never,
          requestId: "00000000-0000-4000-8000-000000000000",
          input: "x",
          creditsCost: 1,
        }),
    );
    expect(code).toBe("23514");
  });

  it("deduplicates payment events per provider", async () => {
    const event = {
      provider: "waffo",
      providerEventId: "evt_1",
      eventType: "payment.succeeded",
    };
    await testDb().insert(paymentEvents).values(event);
    expect(await pgCode(testDb().insert(paymentEvents).values(event))).toBe(
      "23505",
    );
  });

  it("counts rate limit hits atomically per window", async () => {
    const windowStart = new Date("2026-10-05T00:00:00Z");
    const hit = () =>
      testDb()
        .insert(rateLimits)
        .values({ key: "task:user_1", windowStart, count: 1 })
        .onConflictDoUpdate({
          target: [rateLimits.key, rateLimits.windowStart],
          set: { count: sql`${rateLimits.count} + 1` },
        })
        .returning({ count: rateLimits.count });
    await Promise.all(Array.from({ length: 5 }, hit));
    const [row] = await testDb().select().from(rateLimits);
    expect(row.count).toBe(5);
  });
});
