import { afterAll, beforeEach, expect, it } from "vitest";

import { closeTestDb, resetDb, testDb } from "@repo/db/testing/db";

import type { CommonCrawl } from "./adapters/common-crawl";
import { createBudget } from "./budget";
import type { KeywordProvider } from "./keyword-provider";
import { createPlatformSites, lastMonths } from "./platform-sites";

const db = testDb();
let clock = new Date("2026-10-31T12:00:00Z");
const now = () => clock;

const pages: Record<string, string[][]> = {
  "vercel.app": [
    ["cipher-decoder.vercel.app", "quiet-blog.vercel.app"],
    ["flip-a-coin.vercel.app"],
  ],
  "github.io": [["ann.github.io"]],
  "pages.dev": [],
};
const commonCrawl: CommonCrawl = {
  latestCollection: async () => "CC-MAIN-2026-43",
  pages: async (_c, p) => pages[p].length,
  hosts: async (_c, p, page) => pages[p][page] ?? [],
};
let etv: Record<string, number> = {
  "cipher-decoder.vercel.app": 1800,
  "flip-a-coin.vercel.app": 40,
  "ann.github.io": 0,
};
const calls: string[] = [];
const provider = {
  name: "dataforseo",
  maxCostMicros: {},
  async siteTraffic(sites: string[]) {
    calls.push(`traffic:${sites.length}`);
    return {
      value: new Map(
        sites.filter((s) => etv[s]).map((s) => [s, etv[s]] as const),
      ),
      costMicros: 12_000 + sites.length * 120,
    };
  },
  async rankedKeywords(site: string) {
    calls.push(`ranked:${site}`);
    return {
      value: [
        {
          phrase: "cipher identifier",
          rank: 34,
          url: `https://${site}/`,
          metrics: {
            searchVolume: 9900,
            cpcMicros: null,
            adsCompetition: null,
            keywordDifficulty: null,
          },
        },
        {
          phrase: "cipher decoder",
          rank: 3,
          url: `https://${site}/`,
          metrics: {
            searchVolume: 6600,
            cpcMicros: null,
            adsCompetition: null,
            keywordDifficulty: null,
          },
        },
      ],
      costMicros: 13_200,
    };
  },
} as unknown as KeywordProvider;

const sites = (cap = 1_000_000) =>
  createPlatformSites({
    database: db,
    commonCrawl,
    provider,
    budget: createBudget({ database: db, now, dailyPlatformCapMicros: cap }),
    pageTitle: async (url) =>
      url.includes("cipher") ? "Cipher Decoder: decode any cipher" : null,
    now,
  });

async function round(s = sites()) {
  await s.scheduleEvery();
  return s.run((await s.claim())!);
}

beforeEach(async () => {
  clock = new Date("2026-10-31T12:00:00Z");
  calls.length = 0;
  etv = {
    "cipher-decoder.vercel.app": 1800,
    "flip-a-coin.vercel.app": 40,
    "ann.github.io": 0,
  };
  await resetDb();
});
afterAll(closeTestDb);

it("reads the platforms' hosts, keeps the ones with traffic and finds the main keyword", async () => {
  const done = await round();
  expect(done.status).toBe("completed");
  expect(done.report).toMatchObject({
    pagesRead: 3,
    added: 4,
    checked: 4,
    withTraffic: 2,
    keywords: 1,
    titles: 1,
  });
  // One traffic call for the whole batch; the keyword lookup only for 100+ visits.
  expect(calls).toEqual(["traffic:4", "ranked:cipher-decoder.vercel.app"]);
  const list = await sites().list({});
  expect(list.months).toEqual(lastMonths(clock));
  expect(list.months.at(-1)).toBe("2026-10");
  expect(list.items.map((i) => i.host)).toEqual([
    "cipher-decoder.vercel.app",
    "flip-a-coin.vercel.app",
  ]);
  expect(list.items[0]).toMatchObject({
    platform: "vercel.app",
    etv: 1800,
    topKeyword: "cipher decoder",
    topKeywordVolume: 6600,
    topKeywordRank: 3,
    pageTitle: "Cipher Decoder: decode any cipher",
    firstCrawl: "CC-MAIN-2026-43",
    monthly: { "2026-10": 1800 },
  });
  expect(list).toMatchObject({
    total: 2,
    counts: { "vercel.app": 2 },
    known: 4,
    checked: 4,
  });
});

it("rechecks sites with traffic once a month and fills in the next month", async () => {
  await round();
  clock = new Date("2026-11-01T12:30:00Z");
  calls.length = 0;
  etv["cipher-decoder.vercel.app"] = 2500;
  const again = await round();
  // ann.github.io had no traffic: it is not checked again; the keyword is not looked up twice.
  expect(calls).toEqual(["traffic:2"]);
  expect(again.report).toMatchObject({ added: 0, checked: 2 });
  const [top] = (await sites().list({})).items;
  expect(top).toMatchObject({
    etv: 2500,
    monthly: { "2026-10": 1800, "2026-11": 2500 },
  });
});

it("stops paid lookups when the platform budget is out and keeps the hosts for later", async () => {
  const done = await round(sites(0));
  expect(done).toMatchObject({
    status: "partial",
    errorCode: "DAILY_BUDGET_EXHAUSTED",
  });
  expect(calls).toEqual([]);
  expect(await sites().list({})).toMatchObject({ known: 4, checked: 0 });
});

it("filters by platform, searches and hides", async () => {
  await round();
  const s = sites();
  expect((await s.list({ platform: "github.io" })).total).toBe(0);
  expect((await s.list({ q: "cipher decoder" })).total).toBe(1);
  const [first] = (await s.list({})).items;
  await s.hide(first.id, true);
  expect((await s.list({})).items.map((i) => i.host)).toEqual([
    "flip-a-coin.vercel.app",
  ]);
  expect((await s.list({ hidden: "1" })).total).toBe(1);
});

it("runs once a day", async () => {
  const s = sites();
  expect(await s.scheduleEvery()).not.toBeNull();
  clock = new Date("2026-11-01T11:00:00Z");
  expect(await s.scheduleEvery()).toBeNull();
});
