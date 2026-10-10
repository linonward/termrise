import { randomUUID } from "node:crypto";

import { afterAll, beforeEach, expect, it } from "vitest";

import { createCreditService } from "@repo/credits/credit-service";
import { tasks, user } from "@repo/db/schema";
import { closeTestDb, resetDb, testDb } from "@repo/db/testing/db";

import { createTestClient } from "../testing/client";

const { call, signIn } = createTestClient();

beforeEach(resetDb);
afterAll(closeTestDb);

it("refunds a timed-out task before it reads the balance", async () => {
  const cookie = await signIn("balance@example.com");
  const [{ id: userId }] = await testDb().select({ id: user.id }).from(user);
  const credits = createCreditService(testDb());
  const [task] = await testDb()
    .insert(tasks)
    .values({
      userId,
      status: "PENDING",
      requestId: randomUUID(),
      input: "stuck",
      creditsCost: 1,
      createdAt: new Date(Date.now() - 16 * 60_000),
    })
    .returning();
  await credits.debit({
    userId,
    taskId: task.id,
    type: "TASK_DEBIT",
    amount: 1,
    idempotencyKey: `task:${task.id}:debit`,
  });

  const response = await call("/api/credits/balance", { headers: { cookie } });
  expect(await response.json()).toEqual({ balance: 10 });
});

it("needs a session", async () => {
  expect((await call("/api/credits/balance")).status).toBe(401);
});
