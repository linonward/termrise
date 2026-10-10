import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeEach, expect, it } from "vitest";

import {
  keywordMetricSnapshots,
  researchProjects,
  researchRuns,
  user,
} from "@repo/db/schema";
import { closeTestDb, resetDb, testDb } from "@repo/db/testing/db";

import { createFakeAnalyst } from "./adapters/fake-analyst";
import {
  createFakeKeywordProvider,
  FAKE_KEYWORDS_FAILURE,
  FAKE_SERP_FAILURE,
} from "./adapters/fake-keywords";
import type { KeywordProvider } from "./keyword-provider";
import { toKeywordDto } from "./research-dto";
import { createResearchResults } from "./research-results";
import {
  MAX_KEYWORDS,
  SERP_AUDIT_COUNT,
  createResearchRunner,
} from "./research-runner";
import { createResearchService } from "./research-service";

const db = testDb();
const service = createResearchService({ database: db });
const fake = createFakeKeywordProvider();
const analyst = createFakeAnalyst();
const runner = createResearchRunner({ database: db, provider: fake, analyst });
const results = createResearchResults({ database: db });

beforeEach(async () => {
  await resetDb();
  await db.insert(user).values([
    { id: "a", name: "A", email: "a@example.com" },
    { id: "b", name: "B", email: "b@example.com" },
  ]);
});
afterAll(closeTestDb);

const project = (seeds = ["meeting notes", "sales call summary"]) =>
  service.create("a", { name: "P", seeds });
const status = async (id: string) => (await service.get("a", id)).status;

it("expands the seeds, stores metrics and audits the top SERPs", async () => {
  const { id } = await project();
  const run = await runner.run("a", id, { requestId: randomUUID() });
  expect(run).toMatchObject({ status: "completed", stage: "evaluating" });
  expect(await status(id)).toBe("completed");

  const list = (await results.listKeywords("a", id)).map(toKeywordDto);
  expect(list).toHaveLength(16);
  expect(
    list
      .filter((k) => k.source === "seed")
      .map((k) => k.phrase)
      .sort(),
  ).toEqual(["meeting notes", "sales call summary"]);
  expect(list.every((k) => k.provider === "fake")).toBe(true);
  // Highest volume first; keywords without data last.
  const volumes = list.map((k) => k.searchVolume ?? -1);
  expect(volumes).toEqual([...volumes].sort((x, y) => y - x));

  const serps = await results.listSerps("a", id);
  expect(serps.length).toBeLessThanOrEqual(SERP_AUDIT_COUNT);
  expect(serps.length).toBeGreaterThan(0);
  expect(serps[0].results).toHaveLength(10);
});

it("keeps null metrics as null, not 0", async () => {
  const { id } = await project(["a", "b", "c", "d", "e", "f"]);
  await runner.run("a", id, { requestId: randomUUID() });
  const rows = await db.select().from(keywordMetricSnapshots);
  expect(rows.some((r) => r.searchVolume === null)).toBe(true);
  expect(rows.some((r) => r.keywordDifficulty === null)).toBe(true);
});

it("caps the keywords and keeps every seed", async () => {
  const seeds = Array.from({ length: 30 }, (_, i) => `seed ${i}`);
  const { id } = await project(seeds);
  await runner.run("a", id, { requestId: randomUUID() });
  const list = await results.listKeywords("a", id);
  expect(list).toHaveLength(MAX_KEYWORDS);
  expect(list.filter((k) => k.keyword.source === "seed")).toHaveLength(30);
});

it("returns the same run for a retried request and starts only one at once", async () => {
  const { id } = await project();
  const requestId = randomUUID();
  const first = await runner.run("a", id, { requestId });
  expect((await runner.run("a", id, { requestId })).id).toBe(first.id);

  const { id: other } = await project();
  const results = await Promise.allSettled([
    runner.run("a", other, { requestId: randomUUID() }),
    runner.run("a", other, { requestId: randomUUID() }),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(results.find((r) => r.status === "rejected")).toMatchObject({
    reason: { code: "RESEARCH_PROJECT_LOCKED" },
  });
  expect(
    await db
      .select()
      .from(researchRuns)
      .where(eq(researchRuns.projectId, other)),
  ).toHaveLength(1);
});

it("fails the run when expansion fails, and a retry can succeed", async () => {
  const { id } = await project([`broken ${FAKE_KEYWORDS_FAILURE}`]);
  const failed = await runner.run("a", id, { requestId: randomUUID() });
  expect(failed).toMatchObject({
    status: "failed",
    errorCode: "PROVIDER_ERROR",
  });
  expect(await status(id)).toBe("failed");
  expect(await results.listKeywords("a", id)).toEqual([]);

  // The provider recovers: a new request retries from failed.
  const recovered: KeywordProvider = {
    ...fake,
    expand: (_seed, market) => fake.expand("recovered", market),
  };
  const retry = await createResearchRunner({
    database: db,
    provider: recovered,
    analyst,
  }).run("a", id, { requestId: randomUUID() });
  expect(retry.status).toBe("completed");
  expect((await results.listRuns("a", id)).map((r) => r.status)).toEqual([
    "completed",
    "failed",
  ]);
});

it("finishes as partial when a SERP fails", async () => {
  const failingSerp: KeywordProvider = {
    ...fake,
    serp: (phrase, market) =>
      fake.serp(`${phrase} ${FAKE_SERP_FAILURE}`, market),
  };
  const { id } = await project();
  const run = await createResearchRunner({
    database: db,
    provider: failingSerp,
    analyst,
  }).run("a", id, { requestId: randomUUID() });
  expect(run.status).toBe("partial");
  expect(await status(id)).toBe("partial");
  expect(await results.listKeywords("a", id)).toHaveLength(16);
});

it("refuses another user's project, a running project and a bad request", async () => {
  const { id } = await project();
  await expect(
    runner.run("b", id, { requestId: randomUUID() }),
  ).rejects.toMatchObject({ code: "RESEARCH_PROJECT_NOT_FOUND" });
  await expect(results.listKeywords("b", id)).rejects.toMatchObject({
    code: "RESEARCH_PROJECT_NOT_FOUND",
  });
  await expect(runner.run("a", id, {})).rejects.toMatchObject({
    code: "INVALID_INPUT",
  });
  await db
    .update(researchProjects)
    .set({ status: "expanding" })
    .where(eq(researchProjects.id, id));
  await expect(
    runner.run("a", id, { requestId: randomUUID() }),
  ).rejects.toMatchObject({ code: "RESEARCH_PROJECT_LOCKED" });
});

it("deletes runs, keywords and SERPs with the project", async () => {
  const { id } = await project();
  await runner.run("a", id, { requestId: randomUUID() });
  await db.delete(researchProjects).where(eq(researchProjects.id, id));
  expect(await db.select().from(keywordMetricSnapshots)).toEqual([]);
});

it("queues a run for the worker, which claims and runs it once", async () => {
  const { id } = await project();
  const requestId = randomUUID();
  const queued = await runner.queue("a", id, { requestId });
  expect(queued).toMatchObject({ status: "pending", stage: "queued" });
  // The project locks at once: no edit while the run waits.
  await expect(service.update("a", id, { name: "x" })).rejects.toMatchObject({
    code: "RESEARCH_PROJECT_LOCKED",
  });
  expect((await runner.queue("a", id, { requestId })).id).toBe(queued.id);
  expect(await runner.pendingRunIds()).toEqual([queued.id]);

  const [first, second] = await Promise.all([
    runner.execute(queued.id),
    runner.execute(queued.id),
  ]);
  expect([first, second].filter(Boolean)).toHaveLength(1);
  expect((first ?? second)?.status).toBe("completed");
  expect(await runner.pendingRunIds()).toEqual([]);
  expect(await runner.execute(queued.id)).toBeNull();
});
