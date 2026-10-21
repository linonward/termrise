import { randomUUID } from "node:crypto";

import { afterAll, beforeEach, expect, it } from "vitest";

import {
  opportunityEvaluations,
  radarItems,
  radarObservations,
  user,
} from "@repo/db/schema";
import { closeTestDb, resetDb, testDb } from "@repo/db/testing/db";

import { createFakeAnalyst } from "./adapters/fake-analyst";
import { createFakeKeywordProvider } from "./adapters/fake-keywords";
import { createBudget } from "./budget";
import { evaluateOpportunities } from "./evaluate";
import { createOffTopicReviews } from "./off-topic-reviews";
import { createOpportunityResults } from "./opportunity-results";
import { toOpportunityDetailDto } from "./research-dto";
import { createResearchRunner } from "./research-runner";
import { createResearchService } from "./research-service";
import { exportResearchData } from "./user-data";

const db = testDb();
const service = createResearchService({ database: db });
const runner = createResearchRunner({
  database: db,
  provider: createFakeKeywordProvider(),
  analyst: createFakeAnalyst(),
});
const results = createOpportunityResults({ database: db });
const reviews = createOffTopicReviews({ database: db });

beforeEach(async () => {
  await resetDb();
  await db.insert(user).values([
    { id: "a", name: "A", email: "a@example.com" },
    { id: "b", name: "B", email: "b@example.com" },
  ]);
});
afterAll(closeTestDb);

// A project from a radar item: the fake analysis marks every keyword of the
// "electronic signature app" cluster off topic (no word in common with the title).
async function radarProject() {
  const [item] = await db
    .insert(radarItems)
    .values({
      provider: "hacker_news",
      externalId: randomUUID(),
      url: "https://example.com/drone",
      title: "Show HN: Dovepass – check a drone flight path",
      normalizedTerm: "dovepass – check a drone flight path",
      firstSeenAt: new Date("2026-10-19T08:00:00Z"),
      lastSeenAt: new Date("2026-10-19T08:00:00Z"),
    })
    .returning();
  await db.insert(radarObservations).values({
    itemId: item.id,
    observedAt: new Date("2026-10-19T08:00:00Z"),
    list: "show",
    rank: 1,
  });
  const { id } = await service.create("a", {
    name: "Dovepass",
    seeds: ["drone flight path checker", "electronic signature app"],
    radarItemId: item.id,
  });
  await runner.run("a", id, { requestId: randomUUID() });
  const list = await results.list("a", id);
  const find = (cluster: string) =>
    list.find((o) => o.opportunity.cluster === cluster)!;
  return {
    offTopic: find("electronic signature app"),
    onTopic: find("drone flight path checker"),
  };
}

const detail = async (id: string) =>
  toOpportunityDetailDto(await results.get("a", id));

it("scores a keyword again when the owner says it is on topic", async () => {
  const { offTopic } = await radarProject();
  const before = await detail(offTopic.opportunity.id);
  expect(before).toMatchObject({
    dimensions: { demand: 0 },
    needsReview: true,
  });
  const strongest = before.keywords.find((k) => (k.searchVolume ?? 0) > 0)!;
  expect(strongest).toMatchObject({ offTopic: true, offTopicBy: "ai" });

  await reviews.review("a", offTopic.opportunity.id, strongest.id, {
    offTopic: false,
  });
  const after = await detail(offTopic.opportunity.id);
  expect(after.dimensions.demand).toBeGreaterThan(0);
  // The owner checked the marks: the off-topic share no longer asks for a review.
  expect(after.needsReview).toBe(false);
  expect(after.keywords.find((k) => k.id === strongest.id)).toMatchObject({
    offTopic: false,
    offTopicBy: "user",
  });
  // A new evaluation of the same run: the analysis, rank and version stay.
  expect(after).toMatchObject({
    rank: before.rank,
    analysis: before.analysis,
    scoringVersion: before.scoringVersion,
  });
  expect(await db.select().from(opportunityEvaluations)).toHaveLength(3);
});

it("leaves a keyword the owner marks off topic out of the score", async () => {
  const { onTopic } = await radarProject();
  const before = await detail(onTopic.opportunity.id);
  expect(before.keywords.every((k) => !k.offTopic)).toBe(true);
  for (const k of before.keywords)
    await reviews.review("a", onTopic.opportunity.id, k.id, { offTopic: true });
  const after = await detail(onTopic.opportunity.id);
  expect(after.dimensions).toMatchObject({ demand: 0, competition: 0 });
  expect(after.keywords.every((k) => k.offTopicBy === "user")).toBe(true);

  // The last call wins, and repeating it changes nothing.
  const [first] = before.keywords;
  await reviews.review("a", onTopic.opportunity.id, first.id, {
    offTopic: false,
  });
  await reviews.review("a", onTopic.opportunity.id, first.id, {
    offTopic: false,
  });
  const [project] = await exportResearchData(db, "a");
  const exported = project.opportunities.find(
    (o) => o.cluster === "drone flight path checker",
  )!;
  expect(exported.keywordReviews).toHaveLength(before.keywords.length);
  expect(
    exported.keywordReviews.find((r) => r.phrase === first.phrase),
  ).toMatchObject({ offTopic: false });
});

it("accepts reviews only from the owner, of the opportunity's own keywords", async () => {
  const { offTopic, onTopic } = await radarProject();
  const [keyword] = (await detail(offTopic.opportunity.id)).keywords;
  await expect(
    reviews.review("b", offTopic.opportunity.id, keyword.id, {
      offTopic: false,
    }),
  ).rejects.toMatchObject({ code: "OPPORTUNITY_NOT_FOUND" });
  await expect(
    reviews.review("a", "not-a-uuid", keyword.id, { offTopic: false }),
  ).rejects.toMatchObject({ code: "OPPORTUNITY_NOT_FOUND" });
  await expect(
    reviews.review("a", onTopic.opportunity.id, keyword.id, {
      offTopic: false,
    }),
  ).rejects.toMatchObject({ code: "KEYWORD_NOT_FOUND" });
  await expect(
    reviews.review("a", offTopic.opportunity.id, "nope", { offTopic: false }),
  ).rejects.toMatchObject({ code: "KEYWORD_NOT_FOUND" });
  await expect(
    reviews.review("a", offTopic.opportunity.id, keyword.id, { offTopic: 1 }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
});

it("keeps the owner's reviews when the project is evaluated again", async () => {
  const { offTopic } = await radarProject();
  const before = await detail(offTopic.opportunity.id);
  const strongest = before.keywords.find((k) => (k.searchVolume ?? 0) > 0)!;
  await reviews.review("a", offTopic.opportunity.id, strongest.id, {
    offTopic: false,
  });
  const reviewed = await detail(offTopic.opportunity.id);
  await evaluateOpportunities({
    database: db,
    analyst: createFakeAnalyst(),
    budget: createBudget({ database: db }),
    now: () => new Date(),
    projectId: offTopic.opportunity.projectId,
    runId: offTopic.evaluation.runId,
  });
  const again = await detail(offTopic.opportunity.id);
  expect(again.evaluatedAt > reviewed.evaluatedAt).toBe(true);
  expect(again).toMatchObject({
    dimensions: reviewed.dimensions,
    needsReview: reviewed.needsReview,
  });
  expect(again.keywords.find((k) => k.id === strongest.id)).toMatchObject({
    offTopic: false,
    offTopicBy: "user",
  });
});
