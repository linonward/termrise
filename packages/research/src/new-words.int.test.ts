import { eq } from "drizzle-orm";
import { afterAll, beforeEach, expect, it } from "vitest";

import { apiUsage, newWords, poolRounds } from "@repo/db/schema";
import { closeTestDb, resetDb, testDb } from "@repo/db/testing/db";

import { createFakeNewWordClassifier } from "./adapters/fake-new-word-classes";
import { createFakeNewWordOriginAnalyst } from "./adapters/fake-new-word-origin";
import { createFakeNewWordOrigin } from "./adapters/fake-new-word-origin-sources";
import { createFakeNewWordAnalyst } from "./adapters/fake-new-words";
import type { OriginSource } from "./adapters/origin-sources";
import { createRdapClient } from "./adapters/rdap";
import { createBudget } from "./budget";
import type { KeywordProvider } from "./keyword-provider";
import { createNewWords } from "./new-words";

const db = testDb();
let clock = new Date("2026-10-31T02:00:00Z");
const now = () => clock;

// 30 days of [words..., gpts]: flat zero, then a burst in the last days.
const curveOf = (peak: number) => (i: number) =>
  i < 27 ? 0 : (peak * (i - 26)) / 3;
const burst = (...peaks: number[]) =>
  Array.from({ length: 30 }, (_, i) => ({
    at: new Date(Date.UTC(2026, 9, 1 + i)).toISOString().slice(0, 10),
    values: [...peaks.map((p) => curveOf(p)(i)), 40],
  }));

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
      suggestions: 20_000,
      compare: 20_000,
      rising: 20_000,
    },
    expand: () => charged("expand", []),
    risingQueries: (root) =>
      charged(
        "rising",
        root === "ai"
          ? [
              {
                query: "AI Impacts Theoretical Computer Science",
                value: 13950,
              },
              { query: "ai bubble", value: 150 },
            ]
          : [
              { query: "ragdoll robot boxing", value: 5000 },
              { query: "ragdoll robot boxing codes", value: 900 },
            ],
      ),
    trendCompare: (phrases) =>
      charged(
        "compare",
        burst(
          ...phrases
            .filter((p) => p !== "gpts")
            .map((p) => (p.startsWith("ai") ? 22 : 4)),
        ),
      ),
    serp: (phrase, _m, depth) =>
      charged(
        "serp",
        Array.from({ length: depth ?? 10 }, (_, i) => ({
          rank: i + 1,
          url: `https://site${i}.com/page`,
          site: `site${i}.com`,
          title:
            i === 0 && phrase.startsWith("ragdoll")
              ? `${phrase} wiki`
              : `Result ${i}`,
          type: "organic",
        })),
      ),
    suggestions: (seed) =>
      charged("suggestions", [
        {
          phrase: seed,
          metrics: {
            searchVolume: 1900,
            keywordDifficulty: 12,
            cpcMicros: null,
            adsCompetition: null,
          },
        },
      ]),
  };
}

const rdap = createRdapClient({
  fetch: (async (url: string) =>
    Response.json({
      events: [
        {
          eventAction: "registration",
          eventDate: String(url).includes("site1.com")
            ? "2026-09-01T00:00:00Z"
            : "2015-01-01T00:00:00Z",
        },
      ],
    })) as unknown as typeof fetch,
});

const words = (
  provider: KeywordProvider,
  dataUsd = 1,
  originSources?: OriginSource[],
) =>
  createNewWords({
    database: db,
    provider,
    analyst: createFakeNewWordAnalyst(),
    originSources,
    originAnalyst: createFakeNewWordOriginAnalyst(),
    rdap,
    budget: createBudget({
      database: db,
      now,
      dailyNewWordCapMicros: { data: dataUsd * 1_000_000, ai: 100_000 },
    }),
    roots: ["ai", "game"],
    checksPerDay: 10,
    now,
  });

beforeEach(async () => {
  clock = new Date("2026-10-31T02:00:00Z");
  await resetDb();
});
afterAll(closeTestDb);

it("collects rising queries, measures them against gpts and judges them", async () => {
  const provider = stub();
  const w = words(provider);
  await w.scheduleDaily(0);
  const done = await w.run((await w.claim())!);
  expect(done.status).toBe("completed");
  expect(done.report).toMatchObject({
    roots: [
      { root: "ai", rising: 1 },
      { root: "game", rising: 2 },
    ],
    added: 3,
  });
  const { items } = await w.list({});
  const ai = items.find(
    (i) => i.word.phrase === "ai impacts theoretical computer science",
  )!;
  expect(ai.word).toMatchObject({
    verdict: "worth",
    buildAs: "new_site",
    dedicatedPages: 0,
    isNew: "yes",
    rising: "yes",
    burstDay: "2026-10-28",
    searchVolume: 1900,
    category: "ai",
    newSites: [{ domain: "site1.com", registeredOn: "2026-09-01" }],
  });
  // The last 7 days' average: (22/3 + 44/3 + 22) against 7 × 40.
  expect(ai.word.ratio).toBeCloseTo(44 / 280);
  expect(ai.word).toMatchObject({ firstDay: "2026-10-28", growth7: null });
  expect(ai.roots.map((r) => [r.root, r.growth])).toEqual([["ai", 13950]]);
  const boxing = await w.get(
    items.find((i) => i.word.phrase === "ragdoll robot boxing")!.word.id,
  );
  // Its long tail is an inner page candidate.
  expect(boxing.innerCandidates).toBe(1);
  expect(boxing.children.map((c) => c.phrase)).toEqual([
    "ragdoll robot boxing codes",
  ]);
  expect(boxing.word.dedicatedPages).toBe(1);
  // Every paid call belongs to the round; the analysis is an AI call.
  const usage = await db
    .select()
    .from(apiUsage)
    .where(eq(apiUsage.poolRoundId, done.id));
  expect(usage.filter((u) => u.kind === "data")).toHaveLength(
    provider.calls.length,
  );
  expect(usage.filter((u) => u.kind === "ai")).toHaveLength(3);
});

it("measures a rising word again the next day, but not the same day", async () => {
  const w = words(stub());
  await w.scheduleDaily(0);
  await w.run((await w.claim())!);
  expect(await w.scheduleDaily(0)).toBeNull();
  clock = new Date("2026-11-01T02:00:00Z");
  await w.scheduleDaily(0);
  const second = await w.run((await w.claim())!);
  expect((second.report as { checked: unknown[] }).checked).toHaveLength(3);
});

it("keeps the burst day of the first measurement while the peak grows", async () => {
  const provider = stub();
  const w = words(provider);
  await w.scheduleDaily(0);
  await w.run((await w.claim())!);
  const phrase = "ai impacts theoretical computer science";
  const before = (await w.list({})).items.find(
    (i) => i.word.phrase === phrase,
  )!;
  expect(before.word.burstDay).toBe("2026-10-28");
  // The next day the word jumps: 10% of the new peak is reached only on 10-30,
  // which a fresh reading would take as the burst.
  provider.trendCompare = async () => ({
    value: Array.from({ length: 30 }, (_, i) => ({
      at: new Date(Date.UTC(2026, 9, 2 + i)).toISOString().slice(0, 10),
      values: [i < 26 ? 0 : i < 28 ? 1 : 100, 40],
    })),
    costMicros: 10_000,
  });
  clock = new Date("2026-11-01T02:00:00Z");
  await w.scheduleDaily(0);
  await w.run((await w.claim())!);
  const after = (await w.list({})).items.find((i) => i.word.phrase === phrase)!;
  expect(after.word.peakDay).toBe("2026-10-30");
  expect(after.word.burstDay).toBe("2026-10-28");
});

it("stops at the new words' daily budget, apart from the evergreen one", async () => {
  const w = words(stub(), 0.03);
  await w.scheduleDaily(0);
  const done = await w.run((await w.claim())!);
  expect(done.status).toBe("partial");
  expect(done.errorCode).toBe("DAILY_BUDGET_EXHAUSTED");
  const [manual] = await db
    .select()
    .from(poolRounds)
    .where(eq(poolRounds.kind, "manual"));
  expect(manual).toBeUndefined();
});

it("hides a word from the list and shows it again", async () => {
  const w = words(stub());
  await w.scheduleDaily(0);
  await w.run((await w.claim())!);
  const [first] = (await w.list({})).items;
  await w.hide(first.word.id, true);
  expect((await w.list({})).items).toHaveLength(2);
  expect((await w.list({ hidden: "1" })).items).toHaveLength(1);
  await w.hide(first.word.id, false);
  expect((await w.list({})).items).toHaveLength(3);
  await expect(w.get("nope")).rejects.toMatchObject({
    code: "NEW_WORD_NOT_FOUND",
  });
});

it("traces why worth and try words rose, from the free sources around the burst", async () => {
  const seen: { source: string; phrase: string; from: string }[] = [];
  const sources = createFakeNewWordOrigin(seen);
  const w = words(stub(), 1, sources);
  await w.scheduleDaily(0);
  const done = await w.run((await w.claim())!);
  const traced = (await w.list({})).items.filter(
    (i) => i.word.verdict === "worth" || i.word.verdict === "try",
  );
  expect(traced.length).toBeGreaterThan(0);
  expect(done.report).toMatchObject({
    origins: traced.length,
    // One source failed: the others still count.
    sourceFailures: ["hugging_face"],
  });
  const ai = (await w.list({})).items.find(
    (i) => i.word.phrase === "ai impacts theoretical computer science",
  )!.word;
  expect(ai).toMatchObject({
    originType: "open_source",
    originSummary:
      "测试数据：ai impacts theoretical computer science 来自 a/ai-impacts",
  });
  // Oldest first; the repo started it.
  expect(ai.originEvidence).toEqual([
    expect.objectContaining({ kind: "repo", cited: true, first: true }),
    expect.objectContaining({ kind: "story", cited: true, first: false }),
  ]);
  // The search starts a month before the burst day (2026-10-28).
  expect(seen.find((s) => s.phrase === ai.phrase)?.from).toBe("2026-09-28");
  expect(
    (await w.list({ origin: "open_source" })).items.map((i) => i.word.phrase),
  ).toContain(ai.phrase);
  // A word is traced once; skip words are never traced.
  const skip = (await w.list({ verdict: "skip" })).items;
  for (const s of skip) expect(s.word.originCheckedAt).toBeNull();
  clock = new Date("2026-11-01T02:00:00Z");
  seen.length = 0;
  await w.scheduleDaily(0);
  const again = await w.run((await w.claim())!);
  expect(again.report).toMatchObject({ origins: 0 });
  expect(seen).toEqual([]);
});

it("keeps words untraced when the AI budget is out", async () => {
  const w = createNewWords({
    database: db,
    provider: stub(),
    analyst: createFakeNewWordAnalyst(),
    originSources: createFakeNewWordOrigin([]),
    originAnalyst: createFakeNewWordOriginAnalyst(),
    rdap,
    budget: createBudget({
      database: db,
      now,
      // Each AI call reserves 3,000 and settles 500. The third word analysis fits
      // (2 × 500 + 3,000); the first origin reading does not (3 × 500 + 3,000).
      dailyNewWordCapMicros: { data: 1_000_000, ai: 4_000 },
    }),
    roots: ["ai", "game"],
    checksPerDay: 10,
    now,
  });
  await w.scheduleDaily(0);
  const done = await w.run((await w.claim())!);
  expect(done).toMatchObject({
    status: "partial",
    errorCode: "DAILY_BUDGET_EXHAUSTED",
  });
  const { items } = await w.list({});
  expect(items.every((i) => i.word.originCheckedAt === null)).toBe(true);
});

it("screens up to four words per comparison and deep-checks only those that pass", async () => {
  const provider = stub();
  // ai… is warm; the ragdoll words are too cold to be worth the search results.
  provider.trendCompare = async (phrases) => {
    provider.calls.push(`compare:${phrases.length}`);
    return {
      value: burst(
        ...phrases
          .filter((p) => p !== "gpts")
          .map((p) => (p.startsWith("ai") ? 22 : 0.01)),
      ),
      costMicros: 11_000,
    };
  };
  const w = words(provider);
  await w.scheduleDaily(0);
  const done = await w.run((await w.claim())!);
  expect(done.report).toMatchObject({ screened: 3, deep: 1 });
  // One comparison for the three words; search results only for the warm one.
  expect(provider.calls.filter((c) => c.startsWith("compare"))).toEqual([
    "compare:4",
  ]);
  expect(provider.calls.filter((c) => c === "serp")).toHaveLength(1);
  const cold = (await w.list({})).items.find(
    (i) => i.word.phrase === "ragdoll robot boxing",
  )!.word;
  expect(cold).toMatchObject({
    verdict: "skip",
    dedicatedPages: null,
    serp: null,
    rules: "newword-v3",
  });
  expect(cold.reasons).toEqual(
    expect.arrayContaining([expect.objectContaining({ code: "cold" })]),
  );
});

it("measures a word alone when a louder one in its batch rounds it down to zero", async () => {
  const provider = stub();
  provider.trendCompare = async (phrases) => {
    const words = phrases.filter((p) => p !== "gpts");
    provider.calls.push(`compare:${words.join("|")}`);
    // Together, the loud ai word (twice gpts) rounds the others to 0.
    return {
      value: burst(
        ...words.map((p) =>
          p.startsWith("ai") ? 80 : words.length === 1 ? 4 : 0,
        ),
      ),
      costMicros: 11_000,
    };
  };
  const w = words(provider);
  await w.scheduleDaily(0);
  await w.run((await w.claim())!);
  const compares = provider.calls.filter((c) => c.startsWith("compare"));
  expect(compares).toHaveLength(3);
  expect(compares.slice(1).sort()).toEqual([
    "compare:ragdoll robot boxing",
    "compare:ragdoll robot boxing codes",
  ]);
  const boxing = (await w.list({})).items.find(
    (i) => i.word.phrase === "ragdoll robot boxing",
  )!.word;
  expect(boxing.ratio).toBeGreaterThan(0);
});

it("leaves words that passed beyond the day's deep checks for tomorrow", async () => {
  const w = createNewWords({
    database: db,
    provider: stub(),
    analyst: createFakeNewWordAnalyst(),
    rdap,
    budget: createBudget({
      database: db,
      now,
      dailyNewWordCapMicros: { data: 1_000_000, ai: 100_000 },
    }),
    roots: ["ai", "game"],
    checksPerDay: 1,
    now,
  });
  await w.scheduleDaily(0);
  const done = await w.run((await w.claim())!);
  expect(done.report).toMatchObject({ screened: 3, deep: 1 });
  const { items } = await w.list({});
  const waiting = items.filter((i) => i.word.verdict === null);
  expect(waiting).toHaveLength(2);
  for (const i of waiting)
    expect(i.word.nextCheckAt).toEqual(new Date("2026-11-01T02:00:00Z"));
});

it("scans the roots scanned longest ago, a few per round", async () => {
  const provider = stub();
  const make = () =>
    createNewWords({
      database: db,
      provider,
      budget: createBudget({
        database: db,
        now,
        dailyNewWordCapMicros: { data: 1_000_000, ai: 100_000 },
      }),
      roots: ["ai", "game", "tool"],
      rootsPerDay: 2,
      checksPerDay: 0,
      screensPerDay: 1,
      now,
    });
  const w = make();
  await w.scheduleDaily(0);
  const first = await w.run((await w.claim())!);
  expect(
    (first.report as { roots: { root: string }[] }).roots.map((r) => r.root),
  ).toEqual(["ai", "game"]);
  clock = new Date("2026-11-01T02:00:00Z");
  await w.scheduleDaily(0);
  const second = await w.run((await w.claim())!);
  expect(
    (second.report as { roots: { root: string }[] }).roots.map((r) => r.root),
  ).toEqual(["tool", "ai"]);
});

it("adds names from the free lists, and goes on when one fails", async () => {
  const w = createNewWords({
    database: db,
    provider: stub(),
    budget: createBudget({
      database: db,
      now,
      dailyNewWordCapMicros: { data: 1_000_000, ai: 100_000 },
    }),
    roots: [],
    nameSources: [
      {
        name: "hugging_face",
        names: async () => [
          { name: "liquid lfm3", heat: 3, releasedAt: null },
          { name: "Qwen3.8", heat: 2, releasedAt: null },
        ],
      },
      {
        name: "itch_io",
        names: async () => {
          throw new Error("itch.io returned 503");
        },
      },
    ],
    checksPerDay: 0,
    screensPerDay: 0,
    now,
  });
  await w.scheduleDaily(0);
  const done = await w.run((await w.claim())!);
  expect(done.report).toMatchObject({
    added: 2,
    names: { hugging_face: 2, itch_io: 0 },
    sourceFailures: ["itch_io"],
  });
  const { items } = await w.list({});
  expect(items.map((i) => i.word.phrase).sort()).toEqual([
    "liquid lfm3",
    "qwen3.8",
  ]);
  expect(items[0].roots.map((r) => [r.root, r.growth])).toEqual([
    ["source:hugging_face", null],
  ]);
});

it("searches the web only for words the free sources found nothing on", async () => {
  const searched: string[] = [];
  const w = createNewWords({
    database: db,
    provider: stub(),
    analyst: createFakeNewWordAnalyst(),
    originSources: [
      {
        name: "github",
        // Only the ai word has a repo.
        search: async (phrase) =>
          phrase.startsWith("ai")
            ? [
                {
                  source: "github",
                  kind: "repo",
                  title: "a/ai-impacts",
                  url: "https://github.com/a/ai-impacts",
                  at: "2026-10-27T00:00:00.000Z",
                  score: 5,
                },
              ]
            : [],
      },
    ],
    webOrigin: {
      name: "claude",
      model: "claude-haiku-5-5",
      maxCostMicros: 40_000,
      search: async (phrase) => {
        searched.push(phrase);
        return {
          value: [
            {
              source: "web",
              kind: "page",
              title: `${phrase} trend`,
              url: "https://example.com/trend",
              at: "",
              score: null,
            },
            {
              source: "web",
              kind: "summary",
              title: "A Roblox game update.",
              url: "",
              at: "",
              score: null,
            },
          ],
          costMicros: 25_000,
        };
      },
    },
    originAnalyst: createFakeNewWordOriginAnalyst(),
    rdap,
    budget: createBudget({
      database: db,
      now,
      dailyNewWordCapMicros: { data: 1_000_000, ai: 1_000_000 },
    }),
    roots: ["ai", "game"],
    checksPerDay: 10,
    now,
  });
  await w.scheduleDaily(0);
  const done = await w.run((await w.claim())!);
  const traced = (await w.list({})).items.filter(
    (i) => i.word.originCheckedAt !== null,
  );
  expect(searched).not.toContain("ai impacts theoretical computer science");
  expect(searched.length).toBe(
    traced.filter((i) => !i.word.phrase.startsWith("ai")).length,
  );
  expect(done.report).toMatchObject({ webSearches: searched.length });
  const boxing = traced.find((i) => i.word.phrase === searched[0])!.word;
  expect(boxing.originEvidence).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ source: "web", kind: "summary" }),
    ]),
  );
  const [usage] = await db
    .select()
    .from(apiUsage)
    .where(eq(apiUsage.operation, "origin_search"));
  expect(usage).toMatchObject({
    kind: "ai",
    provider: "anthropic",
    costMicros: 25_000,
  });
});

it("scans every few hours with free sources only, and leaves the daily round its place", async () => {
  const provider = stub();
  const w = words(provider);
  // A scan at 01:00 UTC, before the daily round's hour.
  clock = new Date("2026-11-01T01:00:00Z");
  const scan = await w.scheduleScan(3);
  expect(scan?.source).toBe("scan");
  expect(await w.scheduleScan(3)).toBeNull();
  await w.run((await w.claim())!);
  expect(provider.calls).not.toContain("rising");
  // The daily round is still queued at its hour, though a scan ran today.
  clock = new Date("2026-11-01T02:00:00Z");
  expect(await w.scheduleDaily(2)).not.toBeNull();
  await w.run((await w.claim())!);
  expect(provider.calls).toContain("rising");
  // Three hours after the daily round, the next scan.
  clock = new Date("2026-11-01T05:01:00Z");
  expect(await w.scheduleScan(3)).not.toBeNull();
});

it("shares the day's screens across rounds", async () => {
  const w = createNewWords({
    database: db,
    provider: stub(),
    analyst: createFakeNewWordAnalyst(),
    rdap,
    budget: createBudget({
      database: db,
      now,
      dailyNewWordCapMicros: { data: 1_000_000, ai: 100_000 },
    }),
    roots: ["ai", "game"],
    screensPerDay: 2,
    checksPerDay: 10,
    now,
  });
  await w.scheduleDaily(0);
  const first = await w.run((await w.claim())!);
  expect(first.report).toMatchObject({ screened: 2 });
  clock = new Date("2026-10-31T06:00:00Z");
  await w.scheduleScan(3);
  const scan = await w.run((await w.claim())!);
  // Two of two used today: the scan screens nothing.
  expect(scan.report).toMatchObject({ screened: 0 });
});

it("adds a suggestion it has not seen before, after the root's first baseline", async () => {
  let suggestions = ["ai chat", "ai art"];
  const w = createNewWords({
    database: db,
    provider: stub(),
    budget: createBudget({
      database: db,
      now,
      dailyNewWordCapMicros: { data: 1_000_000, ai: 100_000 },
    }),
    roots: ["ai"],
    autocomplete: async () => suggestions,
    screensPerDay: 0,
    checksPerDay: 0,
    now,
  });
  await w.scheduleScan(3);
  const first = await w.run((await w.claim())!);
  // The first scan of a root only records what Google suggests today.
  expect(first.report).toMatchObject({ suggestions: 0 });
  suggestions = ["ai chat", "qwen 3.8 flash ai", "ai art"];
  clock = new Date("2026-10-31T05:01:00Z");
  await w.scheduleScan(3);
  const second = await w.run((await w.claim())!);
  expect(second.report).toMatchObject({ suggestions: 1 });
  const { items } = await w.list({});
  const added = items.find((i) => i.word.phrase === "qwen 3.8 flash ai")!;
  expect(added.roots.map((r) => r.root)).toEqual(["suggest:ai"]);
});

it("lists words by stage, with each stage's count, the origins found and a search", async () => {
  const w = words(stub());
  const day = (d: number) => new Date(Date.UTC(2026, 9, d));
  await db.insert(newWords).values([
    { phrase: "fresh name", firstSeenAt: day(30) },
    { phrase: "passed screen", ratio: 0.4, firstSeenAt: day(29) },
    {
      phrase: "try word",
      ratio: 0.3,
      verdict: "try",
      firstSeenAt: day(28),
      originType: "seasonal",
    },
    {
      phrase: "worth word",
      ratio: 0.2,
      verdict: "worth",
      firstSeenAt: day(27),
      originType: "open_source",
    },
    { phrase: "skipped word", ratio: 3, verdict: "skip", firstSeenAt: day(26) },
    {
      phrase: "hidden word",
      verdict: "worth",
      firstSeenAt: day(25),
      hiddenAt: day(30),
    },
  ]);
  const phrases = async (q: Record<string, string>) =>
    (await w.list(q)).items.map((i) => i.word.phrase);

  // Worth first, then try: the words waiting for the maintainer.
  expect(await phrases({ stage: "decide" })).toEqual([
    "worth word",
    "try word",
  ]);
  expect(await phrases({ stage: "check" })).toEqual(["passed screen"]);
  expect(await phrases({ stage: "screen" })).toEqual(["fresh name"]);
  expect(await phrases({ stage: "skip" })).toEqual(["skipped word"]);
  expect(await phrases({ stage: "hidden" })).toEqual(["hidden word"]);
  // No stage: every word not hidden, newest first.
  expect(await phrases({})).toHaveLength(5);

  const all = await w.list({ stage: "decide" });
  expect(all.counts).toEqual({
    decide: 2,
    check: 1,
    screen: 1,
    skip: 1,
    hidden: 1,
  });
  expect(all.origins).toEqual({ open_source: 1, seasonal: 1 });

  const found = await w.list({ stage: "decide", q: "WORTH" });
  expect(found.items.map((i) => i.word.phrase)).toEqual(["worth word"]);
  expect(found.counts).toEqual({
    decide: 1,
    check: 0,
    screen: 0,
    skip: 0,
    hidden: 0,
  });
  expect(await phrases({ stage: "decide", origin: "seasonal" })).toEqual([
    "try word",
  ]);
});

it("screens the hottest and newest names first, and leaves out names released long ago", async () => {
  const name = (n: string, heat: 1 | 2 | 3, daysAgo: number) => ({
    name: n,
    heat,
    releasedAt: new Date(clock.getTime() - daysAgo * 86_400_000).toISOString(),
  });
  const w = createNewWords({
    database: db,
    provider: stub(),
    budget: createBudget({
      database: db,
      now,
      dailyNewWordCapMicros: { data: 1_000_000, ai: 100_000 },
    }),
    roots: [],
    nameSources: [
      {
        name: "hugging_face",
        names: async () => [
          name("old model", 3, 90),
          name("cold new", 1, 1),
          name("hot week", 3, 10),
          name("hot new", 3, 1),
        ],
      },
    ],
    screensPerDay: 2,
    checksPerDay: 0,
    now,
  });
  await w.scheduleDaily(0);
  const done = await w.run((await w.claim())!);
  expect(done.report).toMatchObject({ added: 3, tooOld: 1, screened: 2 });
  const { items } = await w.list({});
  const byPhrase = new Map(items.map((i) => [i.word.phrase, i.word]));
  expect(byPhrase.has("old model")).toBe(false);
  expect(byPhrase.get("hot new")).toMatchObject({ priority: 6 });
  expect(byPhrase.get("hot week")).toMatchObject({ priority: 5 });
  expect(byPhrase.get("cold new")).toMatchObject({
    priority: 4,
    checkedAt: null,
  });
  expect(byPhrase.get("hot new")!.checkedAt).not.toBeNull();
  expect(byPhrase.get("hot week")!.checkedAt).not.toBeNull();
  expect(
    (await w.list({ stage: "screen" })).items.map((i) => i.word.phrase),
  ).toEqual(["cold new"]);
});

it("drops people, matches and news before paying for the screen", async () => {
  const w = createNewWords({
    database: db,
    provider: stub(),
    classifier: createFakeNewWordClassifier(),
    budget: createBudget({
      database: db,
      now,
      dailyNewWordCapMicros: { data: 1_000_000, ai: 100_000 },
    }),
    roots: [],
    nameSources: [
      {
        name: "trending_now",
        names: async () => [
          { name: "nyc halloween parade", heat: 3, releasedAt: null },
          { name: "lumo game", heat: 2, releasedAt: null },
        ],
      },
    ],
    checksPerDay: 0,
    now,
  });
  await w.scheduleDaily(0);
  const done = await w.run((await w.claim())!);
  expect(done.report).toMatchObject({ classified: 2, dropped: 1, screened: 1 });
  const { items } = await w.list({});
  const parade = items.find((i) => i.word.phrase === "nyc halloween parade")!;
  expect(parade.word).toMatchObject({
    category: "news",
    verdict: "skip",
    ratio: null,
    reasons: [{ code: "category", category: "news" }],
  });
  expect(items.find((i) => i.word.phrase === "lumo game")!.word).toMatchObject({
    category: "game",
  });
  const usage = await db.select().from(apiUsage);
  expect(usage.filter((u) => u.operation === "classify")).toHaveLength(1);
  expect(usage.filter((u) => u.operation === "compare")).toHaveLength(1);
});
