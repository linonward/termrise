import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeEach, expect, it } from "vitest";

import { ProviderAuthError } from "@repo/ai/provider-errors";
import { apiUsage, researchProjects, user } from "@repo/db/schema";
import { closeTestDb, resetDb, testDb } from "@repo/db/testing/db";

import {
  createFakeSeedExtractor,
  FAKE_SEEDS_COST,
  FAKE_SEEDS_INVALID,
} from "./adapters/fake-seeds";
import { createResearchService } from "./research-service";
import type { SeedExtractor } from "./seed-extractor";
import {
  createSeedSuggester,
  createSeedSuggestionQueue,
} from "./seed-suggestions";

const db = testDb();
const service = createResearchService({ database: db });
const queue = createSeedSuggestionQueue({ database: db });
const suggester = createSeedSuggester({
  database: db,
  extractor: createFakeSeedExtractor(),
});
const TITLE = "llmspeed – feel how fast a local llm runs before you buy";

beforeEach(async () => {
  await resetDb();
  await db.insert(user).values([
    { id: "a", name: "A", email: "a@example.com" },
    { id: "b", name: "B", email: "b@example.com" },
  ]);
});
afterAll(closeTestDb);

const project = (seeds = [TITLE], aiBudgetUsd = 1) =>
  service.create("a", { name: "P", seeds, aiBudgetUsd });

it("queues a suggestion, runs it once and charges the AI budget", async () => {
  const { id } = await project();
  const requestId = randomUUID();
  const queued = await queue.request("a", id, { requestId });
  expect(queued).toMatchObject({
    status: "pending",
    sourceSeeds: [TITLE],
    phrases: null,
  });
  // A retried request returns the same suggestion.
  expect((await queue.request("a", id, { requestId })).id).toBe(queued.id);
  expect(await suggester.pendingIds()).toEqual([queued.id]);

  const done = await suggester.execute(queued.id);
  expect(done).toMatchObject({
    status: "completed",
    phrases: ["feel how fast", "before you buy"],
    provider: "fake",
    promptVersion: "fake-v1",
    errorCode: null,
  });
  expect(done?.finishedAt).toBeInstanceOf(Date);
  // A second worker finds nothing to claim.
  expect(await suggester.execute(queued.id)).toBeNull();
  expect(await suggester.pendingIds()).toEqual([]);

  const usage = await db.select().from(apiUsage);
  expect(usage).toMatchObject([
    {
      projectId: id,
      runId: null,
      kind: "ai",
      provider: "fake",
      operation: "suggest_seeds",
      status: "settled",
      costMicros: FAKE_SEEDS_COST.actual,
    },
  ]);
  // The project is unchanged: the user decides whether to use the phrases.
  expect((await service.get("a", id)).seeds).toEqual([TITLE]);
  expect(await queue.latest("a", id)).toMatchObject({ id: queued.id });
});

it("keeps one suggestion in progress per project", async () => {
  const { id } = await project();
  const [first, second] = await Promise.all([
    queue.request("a", id, { requestId: randomUUID() }),
    queue.request("a", id, { requestId: randomUUID() }),
  ]);
  expect(second.id).toBe(first.id);
  await suggester.execute(first.id);
  const next = await queue.request("a", id, { requestId: randomUUID() });
  expect(next.id).not.toBe(first.id);
});

it("fails without calling when the AI budget is short", async () => {
  const { id } = await project([TITLE], 0);
  const queued = await queue.request("a", id, { requestId: randomUUID() });
  expect(await suggester.execute(queued.id)).toMatchObject({
    status: "failed",
    errorCode: "BUDGET_EXHAUSTED",
    phrases: null,
  });
  expect(await db.select().from(apiUsage)).toEqual([]);
});

it("fails on invalid output, and keeps the settled cost", async () => {
  const { id } = await project([`${TITLE} ${FAKE_SEEDS_INVALID}`]);
  const queued = await queue.request("a", id, { requestId: randomUUID() });
  expect(await suggester.execute(queued.id)).toMatchObject({
    status: "failed",
    errorCode: "INVALID_AI_OUTPUT",
  });
  expect(await db.select().from(apiUsage)).toMatchObject([
    { status: "settled" },
  ]);
});

it("fails on a provider error, and keeps the reservation counted", async () => {
  const broken: SeedExtractor = {
    ...createFakeSeedExtractor(),
    async extract() {
      throw new Error("down");
    },
  };
  const { id } = await project();
  const queued = await queue.request("a", id, { requestId: randomUUID() });
  const failing = createSeedSuggester({ database: db, extractor: broken });
  expect(await failing.execute(queued.id)).toMatchObject({
    status: "failed",
    errorCode: "PROVIDER_ERROR",
  });
  expect(await db.select().from(apiUsage)).toMatchObject([
    { status: "failed", costMicros: null },
  ]);
});

it("fails a suggestion whose worker died, and its open reservation", async () => {
  let clock = new Date("2026-10-21T00:00:00Z");
  const now = () => clock;
  const { id } = await project();
  const timed = createSeedSuggester({
    database: db,
    now,
    extractor: {
      ...createFakeSeedExtractor(),
      // The worker dies during the call: it never returns.
      extract: () => new Promise(() => {}),
    },
  });
  const queued = await queue.request("a", id, { requestId: randomUUID() });
  void timed.execute(queued.id);
  await expect
    .poll(async () => (await db.select().from(apiUsage)).length)
    .toBe(1);
  expect(await timed.failStale()).toEqual([]);
  clock = new Date(clock.getTime() + 11 * 60 * 1000);
  expect(await timed.failStale()).toEqual([queued.id]);
  expect(await queue.latest("a", id)).toMatchObject({
    status: "failed",
    errorCode: "SUGGESTION_TIMED_OUT",
  });
  expect(await db.select().from(apiUsage)).toMatchObject([
    { status: "failed" },
  ]);
});

it("accepts a request only for a project the user can still edit", async () => {
  const { id } = await project();
  await expect(
    queue.request("b", id, { requestId: randomUUID() }),
  ).rejects.toMatchObject({ code: "RESEARCH_PROJECT_NOT_FOUND" });
  await expect(queue.latest("b", id)).rejects.toMatchObject({
    code: "RESEARCH_PROJECT_NOT_FOUND",
  });
  await expect(
    queue.request("a", id, { requestId: "nope" }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  await db
    .update(researchProjects)
    .set({ status: "completed" })
    .where(eq(researchProjects.id, id));
  await expect(
    queue.request("a", id, { requestId: randomUUID() }),
  ).rejects.toMatchObject({ code: "RESEARCH_PROJECT_LOCKED" });
  expect(await queue.latest("a", id)).toBeNull();
});

it("fails with an auth error, and releases the reservation, when the key is refused", async () => {
  const refused: SeedExtractor = {
    ...createFakeSeedExtractor(),
    async extract() {
      throw new ProviderAuthError("DeepSeek request failed: 401");
    },
  };
  const { id } = await project();
  const queued = await queue.request("a", id, { requestId: randomUUID() });
  const failing = createSeedSuggester({ database: db, extractor: refused });
  expect(await failing.execute(queued.id)).toMatchObject({
    status: "failed",
    errorCode: "PROVIDER_AUTH_FAILED",
  });
  expect(await db.select().from(apiUsage)).toMatchObject([
    { status: "released", costMicros: 0 },
  ]);
});
