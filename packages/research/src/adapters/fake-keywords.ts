import { createHash } from "node:crypto";

import type {
  KeywordIdea,
  KeywordMetrics,
  KeywordProvider,
  SerpItem,
} from "../keyword-provider";

/** A seed containing this marker makes the fake provider fail, so tests can check it. */
export const FAKE_KEYWORDS_FAILURE = "[fail]";
/** A phrase containing this marker makes the fake SERP fail. */
export const FAKE_SERP_FAILURE = "[serp-fail]";

const SUFFIXES = ["tool", "app", "free", "online", "for teams"];
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
    async expand(seed) {
      if (seed.includes(FAKE_KEYWORDS_FAILURE))
        throw new Error("fake keyword provider failure");
      const phrases = [
        seed,
        ...SUFFIXES.map((suffix) => `${seed} ${suffix}`),
        ...PREFIXES.map((prefix) => `${prefix} ${seed}`),
      ];
      return phrases.map((phrase): KeywordIdea => ({
        phrase,
        metrics: metrics(phrase),
      }));
    },
    async serp(phrase) {
      if (phrase.includes(FAKE_SERP_FAILURE))
        throw new Error("fake SERP failure");
      return Array.from({ length: 10 }, (_, i): SerpItem => {
        const site = `site-${seeded(phrase, `site-${i}`, 50) + 1}`;
        return {
          rank: i + 1,
          url: `https://${site}.fixture.invalid/${encodeURIComponent(phrase)}`,
          title: `${phrase} — fixture result ${i + 1}`,
          type: "organic",
        };
      });
    },
  };
}
