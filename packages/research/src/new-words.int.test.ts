import { eq } from "drizzle-orm";
import { afterAll, beforeEach, expect, it } from "vitest";

import { apiUsage, poolRounds } from "@repo/db/schema";
import { closeTestDb, resetDb, testDb } from "@repo/db/testing/db";

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

// 30 days of [word, gpts]: flat zero, then a burst in the last days.
const burst = (peak: number) =>
  Array.from({ length: 30 }, (_, i) => ({
    at: new Date(Date.UTC(2026, 9, 1 + i)).toISOString().slice(0, 10),
    values: [i < 27 ? 0 : (peak * (i - 26)) / 3, 40],
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
      charged("compare", burst(phrases[0].startsWith("ai") ? 22 : 4)),
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
  expect(ai.word.ratio).toBeCloseTo(22 / 40);
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
