import { randomUUID } from "node:crypto";

import { afterAll, beforeEach, expect, it } from "vitest";

import { apiUsage, user } from "@repo/db/schema";
import { closeTestDb, resetDb, testDb } from "@repo/db/testing/db";

import { createFakeAnalyst } from "./adapters/fake-analyst";
import { createFakeKeywordProvider } from "./adapters/fake-keywords";
import type { KeywordProvider } from "./keyword-provider";
import { createResearchRunner } from "./research-runner";
import { createResearchService } from "./research-service";

const db = testDb();
const service = createResearchService({ database: db });
const fake = createFakeKeywordProvider();
const runner = createResearchRunner({
  database: db,
  provider: fake,
  analyst: createFakeAnalyst(),
});

beforeEach(async () => {
  await resetDb();
  await db.insert(user).values([
    { id: "a", name: "A", email: "a@example.com" },
    { id: "b", name: "B", email: "b@example.com" },
  ]);
});
afterAll(closeTestDb);

it("cancels a queued run, so no worker runs it, and the project can run again", async () => {
  const { id } = await service.create("a", { name: "P", seeds: ["notes"] });
  const queued = await runner.queue("a", id, { requestId: randomUUID() });
  expect(await runner.cancel("a", id, queued.id)).toMatchObject({
    status: "cancelled",
  });
  expect((await service.get("a", id)).status).toBe("cancelled");
  expect(await runner.pendingRunIds()).toEqual([]);
  expect(await runner.execute(queued.id)).toBeNull();

  const again = await runner.run("a", id, { requestId: randomUUID() });
  expect(again?.status).toBe("completed");
});

it("stops a running run before its next paid call", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  let started!: () => void;
  const claimed = new Promise<void>((resolve) => (started = resolve));
  const slow: KeywordProvider = {
    ...fake,
    async expand(seed, market) {
      started();
      await gate;
      return fake.expand(seed, market);
    },
  };
  const slowRunner = createResearchRunner({
    database: db,
    provider: slow,
    analyst: createFakeAnalyst(),
  });
  const { id } = await service.create("a", {
    name: "P",
    seeds: ["notes", "invoices", "receipts"],
  });
  const queued = await slowRunner.queue("a", id, { requestId: randomUUID() });
  const running = slowRunner.execute(queued.id);
  await claimed;
  await slowRunner.cancel("a", id, queued.id);
  release();
  await running;

  // The call already out settled; no other seed was expanded.
  const calls = await db.select().from(apiUsage);
  expect(calls).toEqual([
    expect.objectContaining({ operation: "expand", status: "settled" }),
  ]);
  expect((await slowRunner.findRun(id, queued.requestId))?.status).toBe(
    "cancelled",
  );
  expect((await service.get("a", id)).status).toBe("cancelled");
});

it("refuses a finished run, an unknown run and another user's project", async () => {
  const { id } = await service.create("a", { name: "P", seeds: ["notes"] });
  const done = await runner.run("a", id, { requestId: randomUUID() });
  await expect(runner.cancel("a", id, done!.id)).rejects.toMatchObject({
    code: "RESEARCH_RUN_FINISHED",
  });
  await expect(runner.cancel("a", id, randomUUID())).rejects.toMatchObject({
    code: "RESEARCH_RUN_NOT_FOUND",
  });
  await expect(runner.cancel("a", id, "nope")).rejects.toMatchObject({
    code: "RESEARCH_RUN_NOT_FOUND",
  });
  await expect(runner.cancel("b", id, done!.id)).rejects.toMatchObject({
    code: "RESEARCH_PROJECT_NOT_FOUND",
  });
});
