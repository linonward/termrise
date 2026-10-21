import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { ProviderAuthError } from "@repo/ai/provider-errors";
import { apiUsage, user } from "@repo/db/schema";
import { closeTestDb, resetDb, testDb } from "@repo/db/testing/db";

import { createBudget } from "./budget";
import { createResearchService } from "./research-service";

const db = testDb();
const budget = createBudget({ database: db });
const service = createResearchService({ database: db });

beforeEach(async () => {
  await resetDb();
  await db.insert(user).values({ id: "a", name: "A", email: "a@example.com" });
});
afterAll(closeTestDb);

const project = (dataBudgetUsd: number) =>
  service.create("a", {
    name: "P",
    seeds: ["x"],
    dataBudgetUsd,
    aiBudgetUsd: 0,
  });
const call = (projectId: string, maxCostMicros: number) => ({
  projectId,
  runId: null,
  kind: "data" as const,
  provider: "fake",
  operation: "expand",
  maxCostMicros,
});

it("reserves before a call and settles with the reported cost", async () => {
  const { id } = await project(1);
  const result = await budget.charge(call(id, 400_000), async () => ({
    value: "ok",
    costMicros: 150_000,
  }));
  expect(result).toEqual({ value: "ok" });
  expect(await budget.usage(id)).toMatchObject({
    data: { budget: 1_000_000, spent: 150_000, held: 0, remaining: 850_000 },
    ai: { budget: 0, spent: 0, held: 0, remaining: 0 },
  });
});

it("refuses a call the budget cannot cover, without calling", async () => {
  const { id } = await project(0.5);
  let calls = 0;
  const run = async () => {
    calls++;
    return { value: 1, costMicros: 300_000 };
  };
  expect(await budget.charge(call(id, 400_000), run)).not.toBeNull();
  // 300,000 spent: a second 400,000 reservation would pass 500,000.
  expect(await budget.charge(call(id, 400_000), run)).toBeNull();
  expect(calls).toBe(1);
  expect(await budget.charge({ ...call(id, 1), kind: "ai" }, run)).toBeNull();
});

it("keeps a failed call's reservation counted: its cost is unknown", async () => {
  const { id } = await project(1);
  await expect(
    budget.charge(call(id, 600_000), async () => {
      throw new Error("timeout");
    }),
  ).rejects.toThrow("timeout");
  expect((await budget.usage(id)).data).toMatchObject({
    spent: 0,
    held: 600_000,
  });
  expect(await budget.reserve(call(id, 600_000))).toBeNull();
  const [row] = await db.select().from(apiUsage);
  expect(row).toMatchObject({ status: "failed", costMicros: null });
});

it("lets only as many concurrent reservations through as the budget covers", async () => {
  const { id } = await project(1);
  const results = await Promise.all(
    Array.from({ length: 5 }, () => budget.reserve(call(id, 300_000))),
  );
  expect(results.filter(Boolean)).toHaveLength(3);
  expect((await budget.usage(id)).data.held).toBe(900_000);
});

it("releases the reservation of a call the provider refused as unauthorized", async () => {
  const { id } = await project(1);
  await expect(
    budget.charge(call(id, 600_000), async () => {
      throw new ProviderAuthError("DataForSEO serp returned 401");
    }),
  ).rejects.toBeInstanceOf(ProviderAuthError);
  // An unauthorized call is not billed: nothing is spent or held.
  expect((await budget.usage(id)).data).toMatchObject({
    spent: 0,
    held: 0,
    remaining: 1_000_000,
  });
  const [row] = await db.select().from(apiUsage);
  expect(row).toMatchObject({ status: "released", costMicros: 0 });
  expect(await budget.reserve(call(id, 1_000_000))).not.toBeNull();
});

describe("the monthly cap", () => {
  let clock = new Date("2026-10-21T12:00:00Z");
  const capped = createBudget({
    database: db,
    now: () => clock,
    monthlyCapMicros: { data: 1_000_000, ai: 500_000 },
  });
  const spend = (b: typeof capped, projectId: string, micros: number) =>
    b.charge({ ...call(projectId, micros), runId: null }, async () => ({
      value: 1,
      costMicros: micros,
    }));

  it("refuses a call once all projects together reach it this month", async () => {
    clock = new Date("2026-10-21T12:00:00Z");
    const one = await project(10);
    const two = await project(10);
    expect(await spend(capped, one.id, 600_000)).not.toBeNull();
    expect(await spend(capped, two.id, 400_000)).not.toBeNull();
    // Each project has $10 left; the month has nothing left.
    expect(await spend(capped, two.id, 1)).toBeNull();
    expect(capped.refusal(two.id, "data")).toBe("monthly");
    // The AI cap is separate.
    expect(
      await capped.charge(
        { ...call(two.id, 100_000), kind: "ai", runId: null },
        async () => ({ value: 1, costMicros: 100_000 }),
      ),
    ).toBeNull();
    expect(capped.refusal(two.id, "ai")).toBe("project");
  });

  it("starts again on the first day of the next month (UTC)", async () => {
    clock = new Date("2026-10-31T23:59:00Z");
    const { id } = await project(10);
    expect(await spend(capped, id, 1_000_000)).not.toBeNull();
    expect(await spend(capped, id, 1)).toBeNull();
    clock = new Date("2026-11-01T00:00:00Z");
    expect(await spend(capped, id, 1_000_000)).not.toBeNull();
  });

  it("counts held reservations but not released ones", async () => {
    clock = new Date("2026-10-21T12:00:00Z");
    const { id } = await project(10);
    await expect(
      capped.charge({ ...call(id, 600_000), runId: null }, async () => {
        throw new Error("timeout");
      }),
    ).rejects.toThrow();
    await expect(
      capped.charge({ ...call(id, 400_000), runId: null }, async () => {
        throw new ProviderAuthError("refused");
      }),
    ).rejects.toThrow();
    expect(await spend(capped, id, 400_000)).not.toBeNull();
    expect(await spend(capped, id, 1)).toBeNull();
    expect(capped.refusal(id, "data")).toBe("monthly");
  });
});
