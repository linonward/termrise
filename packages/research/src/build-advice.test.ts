import { expect, it } from "vitest";

import { buildAdvice } from "./build-advice";
import type { ClusterEvidence } from "./scoring";

const evidence = (
  volume: number | null,
  kd: number | null,
  dedicatedPages?: number,
): ClusterEvidence => ({
  keywords: [
    {
      phrase: "small",
      searchVolume: 50,
      cpcUsd: null,
      keywordDifficulty: 5,
      fetchedAt: null,
    },
    {
      phrase: "top",
      searchVolume: volume,
      cpcUsd: null,
      keywordDifficulty: kd,
      fetchedAt: null,
    },
  ],
  serpAudited: dedicatedPages !== undefined,
  signals: [],
  serp:
    dedicatedPages === undefined
      ? null
      : {
          phrase: "top",
          results: 10,
          homepages: 2,
          innerPages: 8,
          dedicatedPages,
        },
});

it("advises a new site for demand, a low KD and room in the results", () => {
  expect(buildAdvice(evidence(2400, 30, 2))).toEqual({
    version: "build-v1",
    advice: "new_site",
    reasons: ["volume_high", "kd_low", "dedicated_few"],
  });
});

it("advises an inner page when one condition fails", () => {
  expect(buildAdvice(evidence(22_200, 67, 2)).advice).toBe("inner_page");
  expect(buildAdvice(evidence(2400, 30, 6)).reasons).toEqual([
    "volume_high",
    "kd_low",
    "dedicated_many",
  ]);
  expect(buildAdvice(evidence(500, 10, 0)).advice).toBe("inner_page");
  // Without a KD or a SERP the evidence is not enough for a new site.
  expect(buildAdvice(evidence(2400, null, 1)).advice).toBe("inner_page");
  expect(buildAdvice(evidence(2400, 30)).reasons).toEqual([
    "volume_high",
    "kd_low",
    "no_serp",
  ]);
});

it("says when demand is weak or unknown", () => {
  // The strongest keyword with a volume decides: 50 here.
  expect(buildAdvice(evidence(null, null)).advice).toBe("weak_demand");
  expect(
    buildAdvice({ keywords: [], serpAudited: false, signals: [] }),
  ).toEqual({ version: "build-v1", advice: "unknown", reasons: ["no_volume"] });
});
