import { randomUUID } from "node:crypto";

import { afterAll, beforeEach, expect, it } from "vitest";

import {
  apiUsage,
  keywords,
  opportunityEvaluations,
  user,
} from "@repo/db/schema";
import { closeTestDb, resetDb, testDb } from "@repo/db/testing/db";

import { createFakeAnalyst, FAKE_ANALYSIS_COST } from "./adapters/fake-analyst";
import {
  createFakeKeywordProvider,
  FAKE_COSTS,
} from "./adapters/fake-keywords";
import { createBudget } from "./budget";
import { createResearchRunner } from "./research-runner";
import { createResearchService } from "./research-service";

const db = testDb();
const service = createResearchService({ database: db });
const budget = createBudget({ database: db });
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

const seeds = ["meeting notes", "sales call summary"];
const run = (id: string) => runner.run("a", id, { requestId: randomUUID() });

it("settles every paid call of a run in the ledger", async () => {
  const { id } = await service.create("a", { name: "P", seeds });
  expect(await run(id)).toMatchObject({ status: "completed", errorCode: null });
  const calls = await db.select().from(apiUsage);
  expect(calls.every((c) => c.status === "settled")).toBe(true);
  const count = (operation: string) =>
    calls.filter((c) => c.operation === operation).length;
  expect(count("expand")).toBe(2);
  const analyses = (await db.select().from(opportunityEvaluations)).length;
  expect(count("analyze")).toBe(analyses);
  const usage = await budget.usage(id);
  expect(usage.data.spent).toBe(
    2 * FAKE_COSTS.expand.actual + count("serp") * FAKE_COSTS.serp.actual,
  );
  expect(usage.ai.spent).toBe(analyses * FAKE_ANALYSIS_COST.actual);
  expect(usage.data.held).toBe(0);
});

it("fails a run whose data budget covers no seed, and runs again once raised", async () => {
  const { id } = await service.create("a", {
    name: "P",
    seeds,
    dataBudgetUsd: 0,
  });
  expect(await run(id)).toMatchObject({
    status: "failed",
    errorCode: "BUDGET_EXHAUSTED",
  });
  expect((await service.get("a", id)).status).toBe("budget_exhausted");
  expect(await db.select().from(keywords)).toEqual([]);
  expect(await db.select().from(apiUsage)).toEqual([]);

  await service.update("a", id, { dataBudgetUsd: 5 });
  expect(await run(id)).toMatchObject({ status: "completed" });
});

it("stops a stage when the budget runs short and ends the run partial", async () => {
  // 0.10 USD: one expansion (reserve 0.10, cost 0.075), then one SERP (0.02) fits.
  const { id } = await service.create("a", {
    name: "P",
    seeds,
    dataBudgetUsd: 0.1,
    aiBudgetUsd: 0,
  });
  expect(await run(id)).toMatchObject({
    status: "partial",
    errorCode: "BUDGET_EXHAUSTED",
  });
  const calls = await db.select().from(apiUsage);
  expect(calls.map((c) => c.operation).sort()).toEqual(["expand", "serp"]);
  expect(
    new Set((await db.select().from(keywords)).map((k) => k.seed)),
  ).toEqual(new Set([seeds[0]]));
  // Without AI budget the score stays; the analysis says why it is missing.
  const evaluations = await db.select().from(opportunityEvaluations);
  expect(evaluations.length).toBeGreaterThan(0);
  expect(
    evaluations.every(
      (e) => e.analysis === null && e.analysisError === "BUDGET_EXHAUSTED",
    ),
  ).toBe(true);
  const usage = await budget.usage(id);
  expect(usage.data.spent + usage.data.held).toBeLessThanOrEqual(100_000);
});
