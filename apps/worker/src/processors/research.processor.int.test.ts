import { randomUUID } from "node:crypto";

import { afterAll, beforeEach, expect, it } from "vitest";

import { user } from "@repo/db/schema";
import { closeTestDb, resetDb, testDb } from "@repo/db/testing/db";
import { createMemoryQueue } from "@repo/jobs/adapters/memory";
import { createFakeAnalyst } from "@repo/research/adapters/fake-analyst";
import { createFakeKeywordProvider } from "@repo/research/adapters/fake-keywords";
import { createResearchRunner } from "@repo/research/research-runner";
import { createResearchService } from "@repo/research/research-service";

import { createHandlers, startWorker } from "../worker";

const db = testDb();
const runner = createResearchRunner({
  database: db,
  provider: createFakeKeywordProvider(),
  analyst: createFakeAnalyst(),
});

beforeEach(async () => {
  await resetDb();
  await db.insert(user).values({ id: "a", name: "A", email: "a@example.com" });
});
afterAll(closeTestDb);

it("a scan picks up each queued run once and runs it to the end", async () => {
  const service = createResearchService({ database: db });
  const { id } = await service.create("a", { name: "P", seeds: ["notes"] });
  const queued = await runner.queue("a", id, { requestId: randomUUID() });

  const queue = createMemoryQueue();
  const stop = await startWorker(queue, createHandlers({ runner, queue }));
  // Two scans before the run job is processed: the job id adds it once.
  await queue.enqueue("research.scan", {});
  await queue.enqueue("research.scan", {});
  expect(await queue.drain()).toEqual([]);
  expect((await runner.findRun(id, queued.requestId))?.status).toBe(
    "completed",
  );
  expect(await runner.pendingRunIds()).toEqual([]);
  await stop();
});
