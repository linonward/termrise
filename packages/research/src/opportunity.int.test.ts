import { randomUUID } from "node:crypto";

import { afterAll, beforeEach, expect, it } from "vitest";

import { opportunityEvaluations, user } from "@repo/db/schema";
import { closeTestDb, resetDb, testDb } from "@repo/db/testing/db";

import {
  createFakeAnalyst,
  FAKE_ANALYST_INVALID,
} from "./adapters/fake-analyst";
import { createFakeKeywordProvider } from "./adapters/fake-keywords";
import { analysisSchema } from "./opportunity-analyst";
import { createOpportunityResults } from "./opportunity-results";
import { toOpportunityDto } from "./research-dto";
import { createResearchRunner } from "./research-runner";
import { createResearchService } from "./research-service";
import { SCORING_VERSION } from "./scoring";
import { eraseResearchData, exportResearchData } from "./user-data";

const db = testDb();
const service = createResearchService({ database: db });
const runner = createResearchRunner({
  database: db,
  provider: createFakeKeywordProvider(),
  analyst: createFakeAnalyst(),
});
const results = createOpportunityResults({ database: db });

beforeEach(async () => {
  await resetDb();
  await db.insert(user).values([
    { id: "a", name: "A", email: "a@example.com" },
    { id: "b", name: "B", email: "b@example.com" },
  ]);
});
afterAll(closeTestDb);

async function runProject(seeds: string[], name = "P") {
  const { id } = await service.create("a", { name, seeds });
  await service.importCsv("a", id, {
    csv: `term,observed_at,source\n${seeds[0]},2026-10-01,trends\n${seeds[0]},2026-10-03,hn\n`,
  });
  await runner.run("a", id, { requestId: randomUUID() });
  return id;
}

it("ranks at most five opportunities with versioned scores and analysis", async () => {
  const seeds = [
    "meeting notes",
    "invoice tool",
    "habit tracker",
    "seo checker",
    "pdf merge",
    "photo resize",
    "budget app",
  ];
  const projectId = await runProject(seeds);
  const list = (await results.list("a", projectId)).map(toOpportunityDto);
  expect(list.length).toBeGreaterThan(0);
  expect(list.length).toBeLessThanOrEqual(5);
  expect(list.map((o) => o.rank)).toEqual(
    [...list.map((o) => o.rank)].sort((x, y) => x - y),
  );
  const scores = list.map((o) => o.score);
  expect(scores).toEqual([...scores].sort((x, y) => y - x));
  for (const o of list) {
    expect(o).toMatchObject({
      status: "unreviewed",
      scoringVersion: SCORING_VERSION,
      analystProvider: "fake",
    });
    expect(analysisSchema.safeParse(o.analysis).success).toBe(true);
    expect(seeds).toContain(o.cluster);
  }
});

it("cites the evidence it scored: keywords, SERPs and signals", async () => {
  const projectId = await runProject(["meeting notes"]);
  const [summary] = await results.list("a", projectId);
  const detail = await results.get("a", summary.opportunity.id);
  expect(detail.keywords).toHaveLength(8);
  expect(detail.keywords.every((k) => k.keyword.seed === "meeting notes")).toBe(
    true,
  );
  expect(detail.serps.length).toBeGreaterThan(0);
  expect(detail.signals).toHaveLength(2);
  expect(detail.evaluation.dimensions.trend).toBe(2);
});

it("keeps the score when the analyst output is invalid, and records why", async () => {
  const { id } = await service.create("a", {
    name: "P",
    seeds: [`notes ${FAKE_ANALYST_INVALID}`],
  });
  await runner.run("a", id, { requestId: randomUUID() });
  const [row] = await results.list("a", id);
  expect(row.evaluation).toMatchObject({
    analysis: null,
    analysisError: "AI_INVALID_OUTPUT",
  });
  expect(row.evaluation.score).toBeGreaterThanOrEqual(0);
});

it("shows a user only their own opportunities", async () => {
  const projectId = await runProject(["meeting notes"]);
  const [row] = await results.list("a");
  expect(await results.list("b")).toEqual([]);
  expect(await results.list("b", projectId)).toEqual([]);
  expect(await results.list("a", "not-a-uuid")).toEqual([]);
  await expect(results.get("b", row.opportunity.id)).rejects.toMatchObject({
    code: "OPPORTUNITY_NOT_FOUND",
  });
  await expect(results.get("a", "nope")).rejects.toMatchObject({
    code: "OPPORTUNITY_NOT_FOUND",
  });
});

it("lists opportunities across projects, best first", async () => {
  await runProject(["meeting notes"], "One");
  await runProject(["invoice tool"], "Two");
  const list = await results.list("a");
  expect(new Set(list.map((o) => o.projectName))).toEqual(
    new Set(["One", "Two"]),
  );
  expect(await db.select().from(opportunityEvaluations)).toHaveLength(
    list.length,
  );
});

it("exports opportunities with the account and deletes them with the project", async () => {
  await runProject(["meeting notes"]);
  const [project] = await exportResearchData(db, "a");
  expect(project.opportunities).toMatchObject([
    { cluster: "meeting notes", status: "unreviewed" },
  ]);
  await eraseResearchData(db, "a");
  expect(await db.select().from(opportunityEvaluations)).toEqual([]);
  expect(await results.list("a")).toEqual([]);
});
