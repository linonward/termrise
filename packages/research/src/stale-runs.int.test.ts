import { randomUUID } from "node:crypto";

import { afterAll, beforeEach, expect, it } from "vitest";

import { apiUsage, user } from "@repo/db/schema";
import { closeTestDb, resetDb, testDb } from "@repo/db/testing/db";

import { createFakeAnalyst } from "./adapters/fake-analyst";
import { createFakeKeywordProvider } from "./adapters/fake-keywords";
import type { KeywordProvider } from "./keyword-provider";
import { createResearchRunner, STALE_RUN_MS } from "./research-runner";
import { createResearchService } from "./research-service";

// A worker that dies mid-run leaves the run in running; the scan fails it later.
const db = testDb();
const service = createResearchService({ database: db });
const fake = createFakeKeywordProvider();

let clock = new Date("2026-10-10T08:00:00Z");
const now = () => clock;

// A provider whose first expansion waits until the test lets it go: a stuck worker.
function stuckProvider() {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  let started!: () => void;
  const claimed = new Promise<void>((resolve) => (started = resolve));
  const provider: KeywordProvider = {
    ...fake,
    async expand(seed, market) {
      started();
      await gate;
      return fake.expand(seed, market);
    },
  };
  return { provider, release, claimed };
}

beforeEach(async () => {
  clock = new Date("2026-10-10T08:00:00Z");
  await resetDb();
  await db.insert(user).values({ id: "a", name: "A", email: "a@example.com" });
});
afterAll(closeTestDb);

it("fails a run claimed too long ago, frees its project and closes its calls", async () => {
  const { provider, release, claimed } = stuckProvider();
  const runner = createResearchRunner({
    database: db,
    provider,
    analyst: createFakeAnalyst(),
    now,
  });
  const { id } = await service.create("a", { name: "P", seeds: ["notes"] });
  const queued = await runner.queue("a", id, { requestId: randomUUID() });
  const running = runner.execute(queued.id);
  await claimed;

  // Not stale yet.
  clock = new Date(clock.getTime() + STALE_RUN_MS - 1000);
  expect(await runner.failStaleRuns()).toEqual([]);

  clock = new Date(clock.getTime() + 2000);
  expect(await runner.failStaleRuns()).toEqual([queued.id]);
  expect(await runner.findRun(id, queued.requestId)).toMatchObject({
    status: "failed",
    errorCode: "RUN_TIMED_OUT",
  });
  expect((await service.get("a", id)).status).toBe("failed");
  const [call] = await db.select().from(apiUsage);
  expect(call).toMatchObject({ operation: "expand", status: "failed" });

  // The stuck worker comes back: it changes neither the run nor the project.
  release();
  await running;
  expect((await runner.findRun(id, queued.requestId))?.status).toBe("failed");
  expect((await service.get("a", id)).status).toBe("failed");

  // The project can run again.
  const again = await createResearchRunner({
    database: db,
    provider: fake,
    analyst: createFakeAnalyst(),
    now,
  }).run("a", id, { requestId: randomUUID() });
  expect(again?.status).toBe("completed");
});

it("leaves queued runs alone, however old", async () => {
  const runner = createResearchRunner({
    database: db,
    provider: fake,
    analyst: createFakeAnalyst(),
    now,
  });
  const { id } = await service.create("a", { name: "P", seeds: ["notes"] });
  const queued = await runner.queue("a", id, { requestId: randomUUID() });
  clock = new Date(clock.getTime() + 2 * STALE_RUN_MS);
  expect(await runner.failStaleRuns()).toEqual([]);
  expect((await runner.findRun(id, queued.requestId))?.status).toBe("pending");
});
