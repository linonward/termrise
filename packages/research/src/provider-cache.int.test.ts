import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeEach, expect, it } from "vitest";

import {
  apiUsage,
  keywordMetricSnapshots,
  serpSnapshots,
  user,
} from "@repo/db/schema";
import { closeTestDb, resetDb, testDb } from "@repo/db/testing/db";

import {
  createDataForSeoProvider,
  DATAFORSEO_CACHE_TTL_MS,
} from "./adapters/dataforseo";
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

// The same request within its time to live is not paid again: stub fetch, real database.
const db = testDb();
const service = createResearchService({ database: db });

let clock = new Date("2026-10-10T08:00:00Z");
const ads = (keywords: string[]): DataForSeoRoute => ({
  cost: 0.075,
  result: keywords.map((keyword) => ({
    keyword,
    search_volume: 1000,
    competition_index: 50,
    cpc: 1,
  })),
});
const kd = (items: [string, number | null][]): DataForSeoRoute => ({
  cost: 0.012,
  result: [
    {
      items: items.map(([keyword, keyword_difficulty]) => ({
        keyword,
        keyword_difficulty,
      })),
    },
  ],
});
const serp: DataForSeoRoute = {
  cost: 0.002,
  result: [
    {
      items: [
        {
          type: "organic",
          rank_group: 1,
          title: "A",
          url: "https://a.example/",
        },
      ],
    },
  ],
};

async function runOnce(
  routes: Record<string, DataForSeoRoute>,
  seeds = ["invoice tool"],
) {
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
    now: () => clock,
  });
  const { id } = await service.create("a", { name: "P", seeds });
  const run = await runner.run("a", id, { requestId: randomUUID() });
  return {
    run,
    calls: calls.map((c) => c.path),
    body: calls.map((c) => c.body),
  };
}

beforeEach(async () => {
  clock = new Date("2026-10-10T08:00:00Z");
  await resetDb();
  await db.insert(user).values({ id: "a", name: "A", email: "a@example.com" });
});
afterAll(closeTestDb);

it("reuses fresh answers for free and keeps the time the provider answered", async () => {
  const routes = {
    [ADS]: ads(["invoice tool", "invoice tool free"]),
    [KD]: kd([
      ["invoice tool", 20],
      ["invoice tool free", null],
    ]),
    [SERP]: serp,
  };
  const first = await runOnce(routes);
  expect(first.calls).toEqual([ADS, KD, SERP, SERP]);

  clock = new Date("2026-10-11T08:00:00Z");
  const second = await runOnce(routes);
  expect(second.run?.status).toBe("completed");
  // Nothing paid: the expansion, both KD answers (one of them "no data") and the SERPs.
  expect(second.calls).toEqual([]);
  expect(await db.$count(apiUsage, eq(apiUsage.kind, "data"))).toBe(4);

  const metrics = await db.select().from(keywordMetricSnapshots);
  expect(metrics).toHaveLength(4);
  expect(
    metrics.every(
      (m) => m.fetchedAt.getTime() === Date.parse("2026-10-10T08:00:00Z"),
    ),
  ).toBe(true);
  expect(metrics.filter((m) => m.keywordDifficulty === 20)).toHaveLength(2);
  const serps = await db.select().from(serpSnapshots);
  expect(serps).toHaveLength(4);
  expect(
    serps.every(
      (s) => s.fetchedAt.getTime() === Date.parse("2026-10-10T08:00:00Z"),
    ),
  ).toBe(true);
});

it("pays again after the time to live", async () => {
  const routes = {
    [ADS]: ads(["invoice tool"]),
    [KD]: kd([["invoice tool", 20]]),
    [SERP]: serp,
  };
  await runOnce(routes);
  clock = new Date(clock.getTime() + DATAFORSEO_CACHE_TTL_MS.serp + 1000);
  // The SERP expired; the expansion and KD did not.
  expect((await runOnce(routes)).calls).toEqual([SERP]);
  clock = new Date(clock.getTime() + DATAFORSEO_CACHE_TTL_MS.expand);
  expect((await runOnce(routes)).calls).toEqual([ADS, KD, SERP]);
});

it("asks difficulty only for phrases not cached", async () => {
  await runOnce({
    [ADS]: ads(["invoice tool"]),
    [KD]: kd([["invoice tool", 20]]),
    [SERP]: serp,
  });
  const second = await runOnce(
    {
      [ADS]: ads(["receipt scanner"]),
      [KD]: kd([["receipt scanner", 30]]),
      [SERP]: serp,
    },
    ["invoice tool", "receipt scanner"],
  );
  expect(second.calls).toEqual([ADS, KD, SERP]);
  expect(second.body[1]).toEqual([
    { keywords: ["receipt scanner"], location_code: 2840, language_code: "en" },
  ]);
});
