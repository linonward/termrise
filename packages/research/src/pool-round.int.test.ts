import { eq } from "drizzle-orm";
import { afterAll, beforeEach, expect, it } from "vitest";

import { apiUsage, poolRounds, user } from "@repo/db/schema";
import { closeTestDb, resetDb, testDb } from "@repo/db/testing/db";

import { createFakePageJudge } from "./adapters/fake-page-judge";
import { createBudget } from "./budget";
import type {
  KeywordIdea,
  KeywordProvider,
  TrendPoint,
} from "./keyword-provider";
import { createPoolRounds, POOL_SUFFIXES } from "./pool-round";
import { createKeywordPool } from "./pool-service";

const db = testDb();
let clock = new Date("2026-11-01T08:00:00Z");
const now = () => clock;
const pool = createKeywordPool({ database: db, now });

// Flat or falling weekly curves, 5 years, oldest first.
const curve = (start: number, end: number): TrendPoint[] =>
  Array.from({ length: 260 }, (_, i) => ({
    week: new Date(Date.UTC(2021, 9, 31) + i * 7 * 86_400_000)
      .toISOString()
      .slice(0, 10),
    value: Math.round(start + ((end - start) * i) / 259),
  }));
const idea = (
  phrase: string,
  volume: number,
  kd = 20,
  cpc = 1,
): KeywordIdea => ({
  phrase,
  metrics: {
    searchVolume: volume,
    keywordDifficulty: kd,
    cpcMicros: cpc * 1_000_000,
    adsCompetition: null,
  },
  monthlySearches: Array(12).fill(volume),
});

// A stub provider with fixed answers: the seed "translator" gives four keywords.
function stub(): KeywordProvider & { calls: string[] } {
  const calls: string[] = [];
  const charged = <T>(op: string, value: T) => {
    calls.push(op);
    return Promise.resolve({ value, costMicros: 10_000 });
  };
  return {
    calls,
    name: "fake",
    maxCostMicros: {
      expand: 1,
      serp: 20_000,
      suggestions: 50_000,
      ranked: 50_000,
      traffic: 20_000,
      trend: 20_000,
    },
    expand: () => charged("expand", []),
    serp: (phrase) =>
      charged(
        "serp",
        ["big.com", "big.com", "small.com"].map((site, i) => ({
          rank: i + 1,
          url: `https://${site}/${i}`,
          site,
          title: phrase,
          type: "organic",
        })),
      ),
    siteTraffic: (sites) =>
      charged(
        "traffic",
        new Map(sites.map((s) => [s, s === "big.com" ? 1_000_000 : 500])),
      ),
    suggestions: (seed, _m, band) => {
      if (band.limit === 1) return charged("metrics", [idea(seed, 9000)]);
      if (band.minVolume === 50)
        return charged(
          "variants",
          Array.from({ length: 37 }, (_, i) => idea(`${seed} ${i}`, 60)),
        );
      return charged("suggestions", [
        idea("spanish translator", 27100),
        idea("falling translator", 9900),
        idea("hard translator", 9000, 45),
        idea("translator near me", 8000),
      ]);
    },
    searchTrend: (phrase) =>
      charged(
        "trend",
        phrase === "translator"
          ? curve(60, 50)
          : phrase === "falling translator"
            ? curve(80, 20)
            : curve(50, 50),
      ),
  };
}

const rounds = (provider: KeywordProvider, capUsd = 0.5, deepChecks = 6) =>
  createPoolRounds({
    database: db,
    provider,
    budget: createBudget({
      database: db,
      now,
      dailyPoolCapMicros: capUsd * 1_000_000,
    }),
    deepChecks,
    now,
  });

beforeEach(async () => {
  clock = new Date("2026-11-01T08:00:00Z");
  await resetDb();
});
afterAll(closeTestDb);

it("queues one daily round per UTC day, from the set hour", async () => {
  const r = rounds(stub());
  clock = new Date("2026-11-01T00:30:00Z");
  expect(await r.scheduleDaily(1)).toBeNull();
  clock = new Date("2026-11-01T01:00:00Z");
  expect(await r.scheduleDaily(1)).toMatchObject({
    kind: "daily",
    status: "queued",
  });
  expect(await r.scheduleDaily(1)).toBeNull();
  clock = new Date("2026-11-02T01:00:00Z");
  expect(await r.scheduleDaily(1)).not.toBeNull();
});

it("queues the scheduled round once a week when told to", async () => {
  const r = rounds(stub());
  expect(await r.scheduleDaily(0, 7)).not.toBeNull();
  clock = new Date("2026-11-07T08:00:00Z");
  expect(await r.scheduleDaily(0, 7)).toBeNull();
  clock = new Date("2026-11-08T08:00:00Z");
  expect(await r.scheduleDaily(0, 7)).not.toBeNull();
});

it("takes the first unused suffix, then the next", async () => {
  const r = rounds(stub());
  expect(await r.nextSource()).toBe(`suffix:${POOL_SUFFIXES[0]}`);
  await pool.record({
    phrase: "x translator",
    source: "suffix:translator",
    status: "failed",
    reasons: [],
    kind: "import",
  });
  expect(await r.nextSource()).toBe(`suffix:${POOL_SUFFIXES[1]}`);
});

it("pulls, screens, deep-checks and reports a round, all charged to the round", async () => {
  const provider = stub();
  const r = rounds(provider);
  await r.scheduleDaily(0);
  const round = (await r.claim())!;
  const done = await r.run(round);
  expect(done).toMatchObject({
    status: "completed",
    source: "suffix:translator",
  });
  const report = done.report as Record<string, unknown>;
  expect(report).toMatchObject({
    pulled: 4,
    added: 4,
    screened: { pass: 2, excluded: 1, failed: 1 },
    budgetStopped: false,
  });
  const byPhrase = new Map(
    (
      report.deep as {
        phrase: string;
        status: string;
        variantCount: number | null;
      }[]
    ).map((d) => [d.phrase, d]),
  );
  // big.com twice with a page for the keyword: 2 strong, under the limit of 3.
  expect(byPhrase.get("spanish translator")).toMatchObject({
    status: "candidate",
    variantCount: 37,
  });
  expect(byPhrase.get("falling translator")?.status).toBe("failed");

  const { items } = await pool.list({});
  const status = new Map(items.map((k) => [k.phrase, k.status]));
  expect(status).toEqual(
    new Map([
      ["spanish translator", "candidate"],
      ["falling translator", "failed"],
      ["hard translator", "failed"],
      ["translator near me", "excluded"],
    ]),
  );
  const spanish = items.find((k) => k.phrase === "spanish translator")!;
  expect(spanish).toMatchObject({
    strongCompetitors: 2,
    innerPages: 3,
    variantCount: 37,
  });
  // The baseline trend is fetched once; the failed trend skips its SERP.
  expect(provider.calls.filter((c) => c === "trend")).toHaveLength(3);
  expect(provider.calls.filter((c) => c === "serp")).toHaveLength(1);
  const usage = await db
    .select()
    .from(apiUsage)
    .where(eq(apiUsage.poolRoundId, round.id));
  expect(usage.length).toBe(provider.calls.length);
});

it("leaves a selected keyword alone and only adds the source", async () => {
  await pool.record({
    phrase: "spanish translator",
    source: "idea",
    status: "selected",
    reasons: [],
    kind: "review",
  });
  const r = rounds(stub());
  await r.scheduleDaily(0);
  await r.run((await r.claim())!);
  const { items } = await pool.list({ q: "spanish" });
  expect(items[0]).toMatchObject({
    status: "selected",
    sources: ["idea", "suffix:translator"],
  });
});

it("checks due keywords first and screens a maintainer's idea before its deep check", async () => {
  await pool
    .add("a-user-not-needed", { phrases: ["morse translator"] })
    .catch(() => undefined);
  await pool.record({
    phrase: "morse translator",
    status: "new",
    reasons: [],
    kind: "review",
  });
  const provider = stub();
  const r = rounds(provider, 0.5, 1);
  await r.scheduleDaily(0);
  const done = await r.run((await r.claim())!);
  const deep = (done.report as { deep: { phrase: string }[] }).deep;
  expect(deep.map((d) => d.phrase)).toEqual(["morse translator"]);
  expect(provider.calls[0]).toBe("suggestions");
  expect(provider.calls).toContain("metrics");
});

it("stops at the daily budget and reports it", async () => {
  const r = rounds(stub(), 0.06);
  await r.scheduleDaily(0);
  const done = await r.run((await r.claim())!);
  expect(done.status).toBe("partial");
  expect(done.errorCode).toBe("DAILY_BUDGET_EXHAUSTED");
  expect((done.report as { budgetStopped: boolean }).budgetStopped).toBe(true);
  // Nothing at all fits: the round ends budget_exhausted.
  clock = new Date("2026-11-01T09:00:00Z");
  const [manual] = await db
    .insert(poolRounds)
    .values({ kind: "manual" })
    .returning();
  void manual;
  const second = await rounds(stub(), 0.06).run((await r.claim())!);
  expect(second.status).toBe("budget_exhausted");
});

it("fails a round whose worker died", async () => {
  const r = rounds(stub());
  await r.scheduleDaily(0);
  await r.claim();
  clock = new Date(clock.getTime() + 31 * 60_000);
  expect(await r.failStale()).toHaveLength(1);
});

it("rechecks one keyword with its own fresh numbers, and nothing else", async () => {
  await db.insert(user).values({ id: "u", name: "U", email: "u@example.com" });
  const imported = await pool.record({
    phrase: "bond savings calculator",
    source: "suffix:calculator",
    status: "candidate",
    reasons: [],
    kind: "import",
    fields: {
      searchVolume: 27100,
      keywordDifficulty: 1,
      strongCompetitors: 0,
    },
  });
  // Another keyword is due: a recheck round leaves it for the next round.
  await pool.record({
    phrase: "morse translator",
    status: "queued",
    reasons: [],
    kind: "review",
  });
  const { round, created } = await pool.requestRecheck("u", imported.id);
  expect(created).toBe(true);
  expect(round.source).toBe("recheck:bond savings calculator");
  // A second request while it waits returns the same round.
  expect((await pool.requestRecheck("u", imported.id)).created).toBe(false);
  const provider = stub();
  const r = rounds(provider);
  const done = await r.run((await r.claim())!);
  const deep = (done.report as { deep: { phrase: string }[] }).deep;
  expect(deep.map((d) => d.phrase)).toEqual(["bond savings calculator"]);
  // No new keywords pulled; the numbers are the keyword's own, fetched again.
  expect(provider.calls).not.toContain("suggestions");
  expect(provider.calls[0]).toBe("metrics");
  const { keyword, checks } = await pool.get(imported.id);
  expect(keyword.searchVolume).toBe(9000);
  // The stub's top 3 has two big.com pages made for the phrase: the imported 0 is replaced.
  expect(keyword.strongCompetitors).toBe(2);
  expect(checks[0].kind).toBe("deep");
});

it("reads the top pages to count strong competitors, and keeps Google's suggestions", async () => {
  await pool.record({
    phrase: "morse translator",
    status: "queued",
    reasons: [],
    kind: "review",
    fields: { searchVolume: 9000, keywordDifficulty: 20, cpcMicros: 1_000_000 },
  });
  const make = (aiCap: number) =>
    createPoolRounds({
      database: db,
      provider: stub(),
      budget: createBudget({
        database: db,
        now,
        dailyPoolCapMicros: 500_000,
        dailyPoolAiCapMicros: aiCap,
      }),
      deepChecks: 1,
      // big.com's first result is gone: its page says 404.
      readPage: async (url) => ({
        url,
        status: url.endsWith("/0") ? 404 : 200,
        title: url.endsWith("/0") ? "Page Not Found" : "Morse Translator",
        h1: null,
        text: "Type text and convert it to morse code online, free translator.",
      }),
      pageJudge: createFakePageJudge(),
      autocomplete: async (phrase) => [`${phrase} audio`, `${phrase} image`],
      now,
    });
  const r = make(100_000);
  await r.scheduleDaily(0);
  await r.run((await r.claim())!);
  const k = (await pool.list({ status: "all" })).items.find(
    (i) => i.phrase === "morse translator",
  )!;
  // The title rule would count both big.com pages; the broken one is not made for it.
  expect(k.strongCompetitors).toBe(1);
  const { checks } = await pool.get(k.id);
  const data = checks[0].data as {
    autocomplete: string[];
    serp: { pageCheck: string; results: { page?: Record<string, unknown> }[] };
  };
  expect(data.autocomplete).toEqual([
    "morse translator audio",
    "morse translator image",
  ]);
  expect(data.serp.pageCheck).toBe("fake-v1");
  // The 404 page is gone: weak, and not made for the phrase.
  expect(data.serp.results[0].page).toMatchObject({
    weak: true,
    access: "gone",
    madeForPhrase: false,
  });
});

it("falls back to the title rule when the page check has no AI budget", async () => {
  await pool.record({
    phrase: "morse translator",
    status: "queued",
    reasons: [],
    kind: "review",
    fields: { searchVolume: 9000, keywordDifficulty: 20, cpcMicros: 1_000_000 },
  });
  const r = createPoolRounds({
    database: db,
    provider: stub(),
    budget: createBudget({ database: db, now, dailyPoolCapMicros: 500_000 }),
    deepChecks: 1,
    // Readable pages, but no AI budget to judge them.
    readPage: async (url) => ({
      url,
      status: 200,
      title: "Something else",
      h1: null,
      text: "x".repeat(200),
    }),
    pageJudge: createFakePageJudge(),
    now,
  });
  await r.scheduleDaily(0);
  await r.run((await r.claim())!);
  const k = (await pool.list({ status: "all" })).items.find(
    (i) => i.phrase === "morse translator",
  )!;
  expect(k.strongCompetitors).toBe(2);
});

it("does not judge pages it cannot read: they fall back to the title rule and are not weak", async () => {
  await pool.record({
    phrase: "morse translator",
    status: "queued",
    reasons: [],
    kind: "review",
    fields: { searchVolume: 9000, keywordDifficulty: 20, cpcMicros: 1_000_000 },
  });
  const r = createPoolRounds({
    database: db,
    provider: stub(),
    budget: createBudget({
      database: db,
      now,
      dailyPoolCapMicros: 500_000,
      dailyPoolAiCapMicros: 100_000,
    }),
    deepChecks: 1,
    // Every site blocks the reader.
    readPage: async (url) => ({
      url,
      status: 403,
      title: null,
      h1: null,
      text: "",
    }),
    pageJudge: createFakePageJudge(),
    now,
  });
  await r.scheduleDaily(0);
  const done = await r.run((await r.claim())!);
  const k = (await pool.list({ status: "all" })).items.find(
    (i) => i.phrase === "morse translator",
  )!;
  // The title rule: both big.com pages carry the phrase.
  expect(k.strongCompetitors).toBe(2);
  const { checks } = await pool.get(k.id);
  const results = (
    checks[0].data as { serp: { results: { page: Record<string, unknown> }[] } }
  ).serp.results;
  expect(results[0].page).toMatchObject({
    access: "unreadable",
    madeForPhrase: null,
    weak: false,
  });
  // Nothing readable: no AI call.
  const usage = await db
    .select()
    .from(apiUsage)
    .where(eq(apiUsage.poolRoundId, done.id));
  expect(usage.filter((u) => u.kind === "ai")).toHaveLength(0);
});

it("holds back a keyword whose top 10 has no tool page", async () => {
  await pool.record({
    phrase: "morse translator",
    status: "queued",
    reasons: [],
    kind: "review",
    fields: { searchVolume: 9000, keywordDifficulty: 20, cpcMicros: 1_000_000 },
  });
  const r = createPoolRounds({
    database: db,
    provider: stub(),
    budget: createBudget({
      database: db,
      now,
      dailyPoolCapMicros: 500_000,
      dailyPoolAiCapMicros: 100_000,
    }),
    deepChecks: 1,
    // Shops and articles only: no page converts anything.
    readPage: async (url) => ({
      url,
      status: 200,
      title: "Buy a morse key",
      h1: null,
      text: "Shop morse keys and telegraph sets. Free shipping on orders. ".repeat(
        4,
      ),
    }),
    pageJudge: createFakePageJudge(),
    now,
  });
  await r.scheduleDaily(0);
  await r.run((await r.claim())!);
  const k = (await pool.list({ status: "all" })).items.find(
    (i) => i.phrase === "morse translator",
  )!;
  expect(k.status).toBe("unsure");
  expect(k.reasons).toEqual([
    { rule: "intent", result: "unsure", value: "no_tool" },
  ]);
});
