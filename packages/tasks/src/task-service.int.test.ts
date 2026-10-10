import { randomUUID } from "node:crypto";

import { afterAll, beforeEach, expect, it } from "vitest";

import { createFakeAiProvider, FAKE_AI_FAILURE } from "@repo/ai/adapters/fake";
import { noAnalytics } from "@repo/analytics/analytics-service";
import { createCreditService } from "@repo/credits/credit-service";
import { creditTransactions, tasks, user } from "@repo/db/schema";
import { closeTestDb, resetDb, testDb } from "@repo/db/testing/db";

import { createTaskService } from "./task-service";

const db = testDb();
const credits = createCreditService(db);
const service = createTaskService({
  database: db,
  provider: createFakeAiProvider(),
});

beforeEach(async () => {
  await resetDb();
  await db.insert(user).values([
    { id: "a", name: "A", email: "a@example.com" },
    { id: "b", name: "B", email: "b@example.com" },
  ]);
  await credits.grantSignupBonus("a", 10);
});
afterAll(closeTestDb);

// A debit as TaskService writes it, for tasks inserted directly.
const debit = (taskId: string) =>
  credits.debit({
    userId: "a",
    taskId,
    type: "TASK_DEBIT",
    amount: 1,
    idempotencyKey: `task:${taskId}:debit`,
  });

const ledger = () =>
  db
    .select({
      type: creditTransactions.type,
      amount: creditTransactions.amount,
    })
    .from(creditTransactions);

it("charges one credit and stores the result", async () => {
  const task = await service.run("a", {
    requestId: randomUUID(),
    input: "hello",
  });
  expect(task).toMatchObject({
    status: "SUCCEEDED",
    output: "HELLO",
    creditsCost: 1,
  });
  expect(await credits.getBalance("a")).toBe(9);
});

it("charges a retried request once", async () => {
  const requestId = randomUUID();
  const [first, second] = await Promise.all([
    service.run("a", { requestId, input: "hello" }),
    service.run("a", { requestId, input: "hello" }),
  ]);
  expect(second.id).toBe(first.id);
  expect(await credits.getBalance("a")).toBe(9);
  expect(await db.select().from(tasks)).toHaveLength(1);
});

it("refunds the credit when the provider fails", async () => {
  const task = await service.run("a", {
    requestId: randomUUID(),
    input: `x ${FAKE_AI_FAILURE}`,
  });
  expect(task).toMatchObject({ status: "FAILED", errorCode: "PROVIDER_ERROR" });
  expect(await credits.getBalance("a")).toBe(10);
  expect((await ledger()).map((e) => [e.type, e.amount])).toEqual(
    expect.arrayContaining([
      ["TASK_DEBIT", -1],
      ["TASK_REFUND", 1],
    ]),
  );
});

it("rejects the task without credits and keeps no row", async () => {
  await expect(
    service.run("b", { requestId: randomUUID(), input: "hello" }),
  ).rejects.toMatchObject({ code: "INSUFFICIENT_CREDITS" });
  expect(await db.select().from(tasks)).toHaveLength(0);
});

it("runs only one of two concurrent tasks on the last credit", async () => {
  await credits.adminAdjust("a", -9, randomUUID(), "spend");
  const results = await Promise.allSettled(
    ["one", "two"].map((input) =>
      service.run("a", { requestId: randomUUID(), input }),
    ),
  );
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(results.find((r) => r.status === "rejected")).toMatchObject({
    reason: { code: "INSUFFICIENT_CREDITS" },
  });
  expect(await db.select().from(tasks)).toHaveLength(1);
  expect(await credits.getBalance("a")).toBe(0);
});

it("rejects empty or too long input", async () => {
  for (const input of ["", " ", "x".repeat(501)])
    await expect(
      service.run("a", { requestId: randomUUID(), input }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  await expect(
    service.run("a", { requestId: "not-a-uuid", input: "x" }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
});

it("lists only the user's own tasks, newest first", async () => {
  await service.run("a", { requestId: randomUUID(), input: "one" });
  await service.run("a", { requestId: randomUUID(), input: "two" });
  await credits.grantSignupBonus("b", 10);
  await service.run("b", { requestId: randomUUID(), input: "other" });
  const list = await service.list("a");
  expect(list.map((t) => t.input)).toEqual(["two", "one"]);
});

it("lists at most the requested number of tasks", async () => {
  for (const input of ["one", "two", "three"])
    await service.run("a", { requestId: randomUUID(), input });
  const list = await service.list("a", 2);
  expect(list.map((t) => t.input)).toEqual(["three", "two"]);
});

it("fails and refunds a task left PENDING after a crash, once", async () => {
  const requestId = randomUUID();
  const [task] = await db
    .insert(tasks)
    .values({
      userId: "a",
      status: "PENDING",
      requestId,
      input: "stuck",
      creditsCost: 1,
      createdAt: new Date(Date.now() - 16 * 60_000),
    })
    .returning();
  await debit(task.id);
  // A newer PENDING task may still be running and is left alone.
  const [running] = await db
    .insert(tasks)
    .values({
      userId: "a",
      status: "PENDING",
      requestId: randomUUID(),
      input: "running",
      creditsCost: 1,
    })
    .returning();
  await debit(running.id);
  expect(await credits.getBalance("a")).toBe(8);

  await Promise.all([service.failStaleTasks("a"), service.failStaleTasks("a")]);
  const list = await service.list("a");
  expect(list.find((t) => t.id === task.id)).toMatchObject({
    status: "FAILED",
    errorCode: "TIMEOUT",
  });
  expect(list.find((t) => t.id === running.id)?.status).toBe("PENDING");
  expect(await credits.getBalance("a")).toBe(9);
});

it("discards a result that returns after the stale cleanup", async () => {
  // A cleanup that runs 16 minutes later sees the task as stale.
  const cleanup = createTaskService({
    database: db,
    provider: createFakeAiProvider(),
    now: () => new Date(Date.now() + 16 * 60_000),
  });
  const events: string[] = [];
  const late = createTaskService({
    database: db,
    analytics: {
      ...noAnalytics,
      capture: async (_userId, event) => {
        events.push(event);
      },
    },
    provider: {
      name: "late",
      run: async () => {
        await cleanup.failStaleTasks("a");
        return { output: "too late" };
      },
    },
  });

  const task = await late.run("a", { requestId: randomUUID(), input: "slow" });
  expect(task).toMatchObject({ status: "FAILED", errorCode: "TIMEOUT" });
  expect(events).not.toContain("task_succeeded");
  expect(await credits.getBalance("a")).toBe(10);
});

it("keeps the stale cleanup result when the provider fails late", async () => {
  const cleanup = createTaskService({
    database: db,
    provider: createFakeAiProvider(),
    now: () => new Date(Date.now() + 16 * 60_000),
  });
  const late = createTaskService({
    database: db,
    provider: {
      name: "late",
      run: async () => {
        await cleanup.failStaleTasks("a");
        throw new Error("provider down");
      },
    },
  });

  const task = await late.run("a", { requestId: randomUUID(), input: "slow" });
  expect(task).toMatchObject({ status: "FAILED", errorCode: "TIMEOUT" });
  expect(await credits.getBalance("a")).toBe(10);
});
