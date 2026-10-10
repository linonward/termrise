import { createHash } from "node:crypto";

import type {
  KeywordIdea,
  KeywordMetrics,
  KeywordProvider,
  SerpItem,
} from "../keyword-provider";

/** A seed containing this marker makes the fake provider fail, so tests can check it. */
export const FAKE_KEYWORDS_FAILURE = "[fail]";
/** A seed containing this marker makes the fake expansion take seconds, so E2E can cancel. */
export const FAKE_KEYWORDS_SLOW = "[slow]";
/** A phrase containing this marker makes the fake SERP fail. */
export const FAKE_SERP_FAILURE = "[serp-fail]";

const SUFFIXES = ["tool", "app", "free", "online", "for teams"];
// Made-up prices, so the budget ledger has something to count; not a provider's rates.
export const FAKE_COSTS = {
  expand: { max: 100_000, actual: 75_000 },
  serp: { max: 20_000, actual: 6_000 },
} as const;
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

// Fixture data for tests and local development: NOT real search data. Results link to
// .invalid domains so they can never be mistaken for real sites.
export function createFakeKeywordProvider(): KeywordProvider {
  return {
    name: "fake",
    maxCostMicros: {
      expand: FAKE_COSTS.expand.max,
      serp: FAKE_COSTS.serp.max,
    },
    async expand(seed) {
      if (seed.includes(FAKE_KEYWORDS_FAILURE))
        throw new Error("fake keyword provider failure");
      if (seed.includes(FAKE_KEYWORDS_SLOW))
        await new Promise((resolve) => setTimeout(resolve, 3000));
      const phrases = [
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
          title: `${phrase} — fixture result ${i + 1}`,
          type: "organic",
        };
      });
      return { value: items, costMicros: FAKE_COSTS.serp.actual };
    },
  };
}
