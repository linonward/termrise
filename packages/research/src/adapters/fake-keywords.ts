import { createHash } from "node:crypto";

import { ProviderAuthError } from "@repo/ai/provider-errors";

import type {
  KeywordIdea,
  KeywordMetrics,
  KeywordProvider,
  RankedKeyword,
  SerpItem,
  TrendPoint,
} from "../keyword-provider";

/** A seed containing this marker makes the fake provider fail, so tests can check it. */
export const FAKE_KEYWORDS_FAILURE = "[fail]";
/** A seed containing this marker makes the fake provider refuse the key (an auth failure). */
export const FAKE_KEYWORDS_AUTH_FAILURE = "[auth-fail]";
/** A seed containing this marker makes the fake expansion take seconds, so E2E can cancel. */
export const FAKE_KEYWORDS_SLOW = "[slow]";
/** A phrase containing this marker makes the fake SERP fail. */
export const FAKE_SERP_FAILURE = "[serp-fail]";
/** A seed containing this marker gets no expansion from expand(), like a rare real seed. */
export const FAKE_KEYWORDS_SEED_ONLY = "[seed-only]";

const SUFFIXES = ["tool", "app", "free", "online", "for teams"];
// Made-up prices, so the budget ledger has something to count; not a provider's rates.
export const FAKE_COSTS = {
  expand: { max: 100_000, actual: 75_000 },
  serp: { max: 20_000, actual: 6_000 },
  suggestions: { max: 200_000, actual: 50_000 },
  ranked: { max: 200_000, actual: 50_000 },
  traffic: { max: 50_000, actual: 12_000 },
  trend: { max: 20_000, actual: 11_000 },
} as const;
// Words around a seed for suggestions(), and around a site name for rankedKeywords().
const MODIFIERS = [
  "online",
  "free",
  "generator",
  "calculator",
  "converter",
  "checker",
  "maker",
  "tool",
  "with steps",
  "for kids",
  "app",
  "chart",
];
const WEEKS = 260;
const PREFIXES = ["best", "how to use"];

// A stable number in [0, max) from the phrase, so a run gives the same data every time.
function seeded(phrase: string, salt: string, max: number) {
  const hash = createHash("sha256").update(`${salt}:${phrase}`).digest();
  return hash.readUInt32BE(0) % max;
}

function metrics(phrase: string): KeywordMetrics {
  // Some phrases have no data at all, like real long-tail keywords.
  if (seeded(phrase, "missing", 6) === 0)
    return {
      searchVolume: null,
      cpcMicros: null,
      adsCompetition: null,
      keywordDifficulty: null,
    };
  return {
    searchVolume: [0, 10, 40, 90, 170, 320, 720, 1600, 4400][
      seeded(phrase, "volume", 9)
    ],
    cpcMicros: seeded(phrase, "cpc", 900) * 10_000,
    adsCompetition: seeded(phrase, "ads", 101),
    // KD is missing more often than volume.
    keywordDifficulty:
      seeded(phrase, "kd-missing", 4) === 0 ? null : seeded(phrase, "kd", 101),
  };
}

// Volumes for suggestions() spread from 100 to 60,000, so every band has some.
function labsMetrics(phrase: string): KeywordMetrics {
  return {
    searchVolume: [
      100, 900, 2400, 5400, 8100, 12100, 18100, 27100, 40500, 60500,
    ][seeded(phrase, "labs-volume", 10)],
    cpcMicros: seeded(phrase, "labs-cpc", 300) * 10_000,
    adsCompetition: seeded(phrase, "labs-ads", 101),
    keywordDifficulty: seeded(phrase, "labs-kd", 60),
  };
}

const monthly = (phrase: string, volume: number | null) =>
  Array.from({ length: 12 }, (_, i) =>
    Math.round(((volume ?? 0) * (80 + seeded(phrase, `month-${i}`, 41))) / 100),
  );

const labsIdea = (phrase: string): KeywordIdea => {
  const metrics = labsMetrics(phrase);
  return {
    phrase,
    metrics,
    monthlySearches: monthly(phrase, metrics.searchVolume),
  };
};

// Fixture data for tests and local development: NOT real search data. Results link to
// .invalid domains so they can never be mistaken for real sites.
export function createFakeKeywordProvider(): KeywordProvider {
  return {
    name: "fake",
    maxCostMicros: {
      expand: FAKE_COSTS.expand.max,
      serp: FAKE_COSTS.serp.max,
      suggestions: FAKE_COSTS.suggestions.max,
      ranked: FAKE_COSTS.ranked.max,
      traffic: FAKE_COSTS.traffic.max,
      trend: FAKE_COSTS.trend.max,
    },
    async expand(seed) {
      if (seed.includes(FAKE_KEYWORDS_AUTH_FAILURE))
        throw new ProviderAuthError("fake keyword provider refused the key");
      if (seed.includes(FAKE_KEYWORDS_FAILURE))
        throw new Error("fake keyword provider failure");
      if (seed.includes(FAKE_KEYWORDS_SLOW))
        await new Promise((resolve) => setTimeout(resolve, 3000));
      const phrases = seed.includes(FAKE_KEYWORDS_SEED_ONLY)
        ? [seed]
        : [
            seed,
            ...SUFFIXES.map((suffix) => `${seed} ${suffix}`),
            ...PREFIXES.map((prefix) => `${prefix} ${seed}`),
          ];
      return {
        value: phrases.map((phrase): KeywordIdea => ({
          phrase,
          metrics: metrics(phrase),
        })),
        costMicros: FAKE_COSTS.expand.actual,
      };
    },
    async serp(phrase) {
      if (phrase.includes(FAKE_SERP_FAILURE))
        throw new Error("fake SERP failure");
      const items = Array.from({ length: 10 }, (_, i): SerpItem => {
        const site = `site-${seeded(phrase, `site-${i}`, 50) + 1}`;
        return {
          rank: i + 1,
          url: `https://${site}.fixture.invalid/${encodeURIComponent(phrase)}`,
          site: `${site}.fixture.invalid`,
          title: `${phrase} — fixture result ${i + 1}`,
          type: "organic",
        };
      });
      return { value: items, costMicros: FAKE_COSTS.serp.actual };
    },
    async suggestions(seed, _market, band) {
      if (seed.includes(FAKE_KEYWORDS_FAILURE))
        throw new Error("fake keyword provider failure");
      const value = [seed, ...MODIFIERS.map((m) => `${seed} ${m}`)]
        .map(labsIdea)
        .filter(
          ({ metrics: { searchVolume: v } }) =>
            v !== null &&
            v >= band.minVolume &&
            (band.maxVolume === undefined || v <= band.maxVolume),
        )
        .sort((a, b) => b.metrics.searchVolume! - a.metrics.searchVolume!)
        .slice(0, band.limit);
      return { value, costMicros: FAKE_COSTS.suggestions.actual };
    },
    async rankedKeywords(site, _market, band) {
      const name = site.split(".")[0].replace(/-/g, " ");
      const value = MODIFIERS.map((m) => `${name} ${m}`)
        .map((phrase): RankedKeyword => ({
          ...labsIdea(phrase),
          rank: seeded(phrase, "ranked-rank", 30) + 1,
          url: `https://${site}/${encodeURIComponent(phrase)}`,
        }))
        .filter(
          ({ metrics: { searchVolume: v } }) =>
            v !== null &&
            v >= band.minVolume &&
            (band.maxVolume === undefined || v <= band.maxVolume),
        )
        .slice(0, band.limit);
      return { value, costMicros: FAKE_COSTS.ranked.actual };
    },
    async siteTraffic(sites) {
      const value = new Map(
        sites.map((site) => [site, seeded(site, "traffic", 200_000)]),
      );
      return { value, costMicros: FAKE_COSTS.traffic.actual };
    },
    async searchTrend(phrase) {
      // A gentle drift per phrase plus noise; dates count back from a fixed week.
      const start = Date.UTC(2021, 9, 31);
      const drift = (seeded(phrase, "trend-drift", 41) - 20) / 1000;
      const value: TrendPoint[] = Array.from({ length: WEEKS }, (_, i) => ({
        week: new Date(start + i * 7 * 86_400_000).toISOString().slice(0, 10),
        value: Math.max(
          1,
          Math.min(
            100,
            Math.round(50 + drift * i * 2 + seeded(phrase, `w${i}`, 9) - 4),
          ),
        ),
      }));
      return { value, costMicros: FAKE_COSTS.trend.actual };
    },
  };
}
