import { expect, it } from "vitest";

import { classifyIntent } from "./intent";
import {
  confidence,
  needsReview,
  scoreDimensions,
  totalScore,
  type ClusterEvidence,
} from "./scoring";

const now = new Date("2026-10-10T00:00:00Z");
const day = (d: string) => new Date(`2026-10-${d}T00:00:00Z`);

// A fixed fixture: the score must not change unless the rules (and their version) do.
const strong: ClusterEvidence = {
  keywords: [
    {
      phrase: "meeting notes tool",
      searchVolume: 2400,
      cpcUsd: 4.2,
      keywordDifficulty: 18,
      fetchedAt: day("09"),
    },
    {
      phrase: "best meeting notes app",
      searchVolume: 880,
      cpcUsd: 3.1,
      keywordDifficulty: 30,
      fetchedAt: day("09"),
    },
    {
      phrase: "how to take meeting notes",
      searchVolume: 5400,
      cpcUsd: 0.4,
      keywordDifficulty: null,
      fetchedAt: day("09"),
    },
    {
      phrase: "meeting notes",
      searchVolume: null,
      cpcUsd: null,
      keywordDifficulty: null,
      fetchedAt: day("09"),
    },
  ],
  serpAudited: true,
  signals: [
    { observedAt: day("01"), source: "trends export" },
    { observedAt: day("03"), source: "hacker news" },
    { observedAt: day("05"), source: "trends export" },
  ],
};

it("classifies intent by rules", () => {
  expect(classifyIntent("best meeting notes app")).toBe("commercial");
  expect(classifyIntent("meeting notes pricing")).toBe("transactional");
  expect(classifyIntent("how to take meeting notes")).toBe("informational");
  expect(classifyIntent("notion login")).toBe("navigational");
  expect(classifyIntent("meeting notes")).toBe("informational");
  expect(classifyIntent("how to use meeting notes app")).toBe("informational");
});

it("scores a fixed fixture the same way every time", () => {
  const dims = scoreDimensions(strong);
  expect(dims).toEqual({
    trend: 3,
    demand: 4,
    competition: 4,
    commercial: 4,
    mvp: 4,
    distribution: 2,
  });
  // 3/5·20 + 4/5·15 + 4/5·20 + 4/5·25 + 4/5·10 + 2/5·10 = 12 + 12 + 16 + 20 + 8 + 4
  expect(totalScore(dims)).toBe(72);
  expect(confidence(strong, now)).toBe(80);
  expect(needsReview(72, 80)).toBe(false);
});

it("does not add synonym volumes together", () => {
  const dims = scoreDimensions({
    ...strong,
    keywords: Array.from({ length: 5 }, (_, i) => ({
      phrase: `notes ${i}`,
      searchVolume: 90,
      cpcUsd: null,
      keywordDifficulty: null,
      fetchedAt: null,
    })),
  });
  expect(dims.demand).toBe(1);
});

it("scores missing data as 0 and flags a high score on weak evidence", () => {
  const weak: ClusterEvidence = {
    keywords: strong.keywords.map((k) => ({ ...k, keywordDifficulty: null })),
    serpAudited: false,
    signals: [],
  };
  const dims = scoreDimensions(weak);
  expect(dims.competition).toBe(0);
  expect(dims.trend).toBe(0);
  expect(confidence(weak, now)).toBeLessThan(50);
  expect(needsReview(70, confidence(weak, now))).toBe(true);
  expect(
    scoreDimensions({ keywords: [], serpAudited: false, signals: [] }),
  ).toEqual({
    trend: 0,
    demand: 0,
    competition: 0,
    commercial: 0,
    mvp: 0,
    distribution: 0,
  });
});
