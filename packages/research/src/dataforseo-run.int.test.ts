import { randomUUID } from "node:crypto";

import { afterAll, beforeEach, expect, it } from "vitest";

import {
  apiUsage,
  keywordMetricSnapshots,
  serpResults,
  serpSnapshots,
  user,
} from "@repo/db/schema";
import { closeTestDb, resetDb, testDb } from "@repo/db/testing/db";

import { createDataForSeoProvider } from "./adapters/dataforseo";
import { createFakeAnalyst } from "./adapters/fake-analyst";
import { createResearchRunner } from "./research-runner";
import { createResearchService } from "./research-service";
import {
  ADS,
  dataForSeoFetch,
  type DataForSeoRoute,
  KD,
  SERP,
} from "./testing/dataforseo-fetch";

// A full run with the DataForSEO adapter over a stub fetch: no call leaves the process.
const db = testDb();
const service = createResearchService({ database: db });

const ads: DataForSeoRoute = {
  cost: 0.075,
  result: [
    {
      keyword: "invoice tool",
      search_volume: 1900,
      competition_index: 87,
      cpc: 4.12,
    },
    {
      keyword: "Invoice Tool Free",
      search_volume: null,
      competition_index: null,
      cpc: null,
    },
  ],
};
const kd: DataForSeoRoute = {
  cost: 0.01224,
  result: [{ items: [{ keyword: "invoice tool", keyword_difficulty: 23 }] }],
};
const serp: DataForSeoRoute = {
  cost: 0.002,
  result: [
    {
      items: [
        {
          type: "organic",
          rank_group: 1,
          title: "Best invoice tool",
          url: "https://a.example/",
        },
      ],
    },
  ],
};

const runWith = async (routes: Record<string, DataForSeoRoute>) => {
  const { fetch, calls } = dataForSeoFetch(routes);
  const runner = createResearchRunner({
    database: db,
    provider: createDataForSeoProvider({
      login: "l",
      password: "p",
      fetch,
      sleep: async () => {},
    }),
    analyst: createFakeAnalyst(),
  });
  const { id } = await service.create("a", {
    name: "P",
    seeds: ["invoice tool"],
  });
  const run = await runner.run("a", id, { requestId: randomUUID() });
  return { run, calls };
};

beforeEach(async () => {
  await resetDb();
  await db.insert(user).values({ id: "a", name: "A", email: "a@example.com" });
});
afterAll(closeTestDb);

it("saves metrics with difficulty and the SERP, and settles reported costs", async () => {
  const { run, calls } = await runWith({ [ADS]: ads, [KD]: kd, [SERP]: serp });
  expect(run).toMatchObject({ status: "completed", errorCode: null });
  expect(calls.map((c) => c.path)).toEqual([ADS, KD, SERP]);
  // Difficulty is asked for every keyword that came without it.
  expect(calls[1].body).toEqual([
    {
      keywords: ["invoice tool", "invoice tool free"],
      location_code: 2840,
      language_code: "en",
    },
  ]);

  const metrics = await db.select().from(keywordMetricSnapshots);
  expect(
    metrics
      .map((m) => [m.provider, m.searchVolume, m.keywordDifficulty])
      .sort(),
  ).toEqual([
    ["dataforseo", null, null],
    ["dataforseo", 1900, 23],
  ]);
  expect(await db.select().from(serpSnapshots)).toEqual([
    expect.objectContaining({ provider: "dataforseo", device: "desktop" }),
  ]);
  expect(await db.select().from(serpResults)).toEqual([
    expect.objectContaining({ rank: 1, url: "https://a.example/" }),
  ]);

  const usage = await db.select().from(apiUsage);
  const cost = (operation: string) =>
    usage.find((u) => u.operation === operation && u.kind === "data");
  expect(cost("expand")).toMatchObject({
    provider: "dataforseo",
    status: "settled",
    costMicros: 75_000,
  });
  expect(cost("difficulty")).toMatchObject({
    status: "settled",
    costMicros: 12_240,
  });
  expect(cost("serp")).toMatchObject({ status: "settled", costMicros: 2_000 });
});

it("goes on without difficulty when that call fails, as partial", async () => {
  const { run } = await runWith({
    [ADS]: ads,
    [KD]: { status: 500 },
    [SERP]: serp,
  });
  expect(run).toMatchObject({ status: "partial" });
  const metrics = await db.select().from(keywordMetricSnapshots);
  expect(metrics.every((m) => m.keywordDifficulty === null)).toBe(true);
  const failed = (await db.select().from(apiUsage)).find(
    (u) => u.operation === "difficulty",
  );
  expect(failed).toMatchObject({ status: "failed", reservedMicros: 50_000 });
});

it("fails the run when the expansion fails", async () => {
  const { run } = await runWith({ [ADS]: { taskStatusCode: 40501 } });
  expect(run).toMatchObject({ status: "failed", errorCode: "PROVIDER_ERROR" });
});
