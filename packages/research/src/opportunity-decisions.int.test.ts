import { randomUUID } from "node:crypto";

import { afterAll, beforeEach, expect, it } from "vitest";

import { opportunityDecisions, user } from "@repo/db/schema";
import { closeTestDb, resetDb, testDb } from "@repo/db/testing/db";

import { createFakeAnalyst } from "./adapters/fake-analyst";
import { createFakeKeywordProvider } from "./adapters/fake-keywords";
import { createOpportunityDecisions } from "./opportunity-decisions";
import { createOpportunityResults } from "./opportunity-results";
import {
  toDecisionDto,
  toExperimentDto,
  toOpportunityDto,
} from "./research-dto";
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
const decisions = createOpportunityDecisions({ database: db });

beforeEach(async () => {
  await resetDb();
  await db.insert(user).values([
    { id: "a", name: "Ada", email: "a@example.com" },
    { id: "b", name: "B", email: "b@example.com" },
  ]);
});
afterAll(closeTestDb);

async function opportunity() {
  const { id } = await service.create("a", {
    name: "P",
    seeds: ["meeting notes"],
  });
  await runner.run("a", id, { requestId: randomUUID() });
  const [row] = await results.list("a", id);
  return row.opportunity.id;
}

const experiment = {
  kind: "landing_smoke_test",
  hypothesis: "Sales reps pay for call summaries",
  channel: "r/sales",
  metric: "paid pre-orders",
  budgetUsd: 50,
  durationDays: 14,
  successThreshold: "3 paid pre-orders",
  stopCondition: "No order after 300 visitors",
};

it("records decisions as an append-only history with the evidence version", async () => {
  const id = await opportunity();
  await decisions.decide("a", id, {
    decision: "needs_validation",
    reason: " Promising, test it ",
  });
  await decisions.decide("a", id, {
    decision: "go",
    reason: "Pre-orders came in",
  });
  const detail = await results.get("a", id);
  expect(toOpportunityDto(detail)).toMatchObject({
    status: "go",
    nextDecisions: ["needs_validation"],
  });
  expect(detail.decisions.map(toDecisionDto)).toMatchObject([
    {
      decision: "go",
      reason: "Pre-orders came in",
      deciderName: "Ada",
      evaluationId: detail.evaluation.id,
      scoringVersion: "v1",
    },
    { decision: "needs_validation", reason: "Promising, test it" },
  ]);
});

it("needs validation before go, allows no-go at once and reopening", async () => {
  const id = await opportunity();
  await expect(
    decisions.decide("a", id, { decision: "go", reason: "x" }),
  ).rejects.toMatchObject({
    code: "OPPORTUNITY_DECISION_INVALID",
  });
  await decisions.decide("a", id, {
    decision: "no_go",
    reason: "Crowded SERP",
  });
  await expect(
    decisions.decide("a", id, { decision: "no_go", reason: "again" }),
  ).rejects.toMatchObject({
    code: "OPPORTUNITY_DECISION_INVALID",
  });
  await decisions.decide("a", id, {
    decision: "needs_validation",
    reason: "New signal",
  });
  expect((await results.get("a", id)).opportunity.status).toBe(
    "needs_validation",
  );
});

it("requires a reason and an owner", async () => {
  const id = await opportunity();
  await expect(
    decisions.decide("a", id, { decision: "no_go", reason: "  " }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
  });
  await expect(
    decisions.decide("a", id, { decision: "maybe", reason: "x" }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
  });
  await expect(
    decisions.decide("b", id, { decision: "no_go", reason: "x" }),
  ).rejects.toMatchObject({
    code: "OPPORTUNITY_NOT_FOUND",
  });
  await expect(
    decisions.addExperiment("b", id, experiment),
  ).rejects.toMatchObject({
    code: "OPPORTUNITY_NOT_FOUND",
  });
  expect(await db.select().from(opportunityDecisions)).toEqual([]);
});

it("decides once when two requests race", async () => {
  const id = await opportunity();
  const outcomes = await Promise.allSettled([
    decisions.decide("a", id, { decision: "no_go", reason: "one" }),
    decisions.decide("a", id, { decision: "no_go", reason: "two" }),
  ]);
  expect(outcomes.filter((o) => o.status === "fulfilled")).toHaveLength(1);
  expect(await db.select().from(opportunityDecisions)).toHaveLength(1);
});

it("plans an experiment and records its result", async () => {
  const id = await opportunity();
  const created = await decisions.addExperiment("a", id, experiment);
  expect(toExperimentDto(created)).toMatchObject({
    ...experiment,
    status: "planned",
    nextStatuses: ["running", "stopped"],
    resultNote: null,
  });
  await expect(
    decisions.addExperiment("a", id, { ...experiment, durationDays: 0 }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
  });

  await decisions.updateExperiment("a", id, created.id, { status: "running" });
  await expect(
    decisions.updateExperiment("a", id, created.id, { status: "passed" }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
  });
  await decisions.updateExperiment("a", id, created.id, {
    status: "passed",
    resultNote: "4 pre-orders, $196",
  });
  await expect(
    decisions.updateExperiment("a", id, created.id, { status: "stopped" }),
  ).rejects.toMatchObject({
    code: "EXPERIMENT_FINISHED",
  });
  await expect(
    decisions.updateExperiment("a", id, randomUUID(), { status: "running" }),
  ).rejects.toMatchObject({
    code: "EXPERIMENT_NOT_FOUND",
  });
  const [stored] = (await results.get("a", id)).experiments.map(
    toExperimentDto,
  );
  expect(stored).toMatchObject({
    status: "passed",
    resultNote: "4 pre-orders, $196",
    nextStatuses: [],
  });
});

it("exports decisions and experiments with the account", async () => {
  const id = await opportunity();
  await decisions.decide("a", id, { decision: "no_go", reason: "Crowded" });
  await decisions.addExperiment("a", id, experiment);
  const [project] = await exportResearchData(db, "a");
  expect(project.opportunities).toMatchObject([
    {
      status: "no_go",
      decisions: [{ decision: "no_go", reason: "Crowded" }],
      experiments: [{ kind: "landing_smoke_test", status: "planned" }],
    },
  ]);
});
