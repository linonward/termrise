import { expect, it } from "vitest";

import {
  analysisKeywords,
  clusterEvidence,
  offTopicMarks,
  offTopicShare,
  type ClusterMember,
} from "./cluster-evidence";
import { MAX_OFF_TOPIC_KEYWORDS } from "./opportunity-analyst";
import { needsReview } from "./scoring";

const competition = (phrase: string, dedicatedPages: number) => ({
  phrase,
  results: 10,
  homepages: 2,
  innerPages: 8,
  dedicatedPages,
});

const member = (
  phrase: string,
  searchVolume: number | null,
  serp: ClusterMember["serp"] = null,
): ClusterMember => ({
  id: phrase,
  phrase,
  searchVolume,
  cpcUsd: 1,
  keywordDifficulty: 20,
  fetchedAt: null,
  serp,
});

// The S37 walk: the seed has no searches, an expansion that means something else has.
const members = [
  member("screen to sign", null),
  member("digital signage app", 320, competition("digital signage app", 3)),
  member(
    "electronic signature app",
    5400,
    competition("electronic signature app", 9),
  ),
];
const signals = [{ observedAt: null, source: "Hacker News" }];

it("uses every keyword and the strongest audited SERP when nothing is off topic", () => {
  const evidence = clusterEvidence("screen to sign", members, signals);
  expect(evidence.keywords.map((k) => k.phrase)).toEqual([
    "screen to sign",
    "digital signage app",
    "electronic signature app",
  ]);
  expect(evidence.serp?.phrase).toBe("electronic signature app");
  expect(evidence.serpAudited).toBe(true);
  expect(evidence.signals).toBe(signals);
});

it("leaves off-topic keywords out of the demand and the competition", () => {
  const evidence = clusterEvidence(
    "screen to sign",
    members,
    signals,
    new Set(["electronic signature app"]),
  );
  expect(evidence.keywords.map((k) => k.phrase)).toEqual([
    "screen to sign",
    "digital signage app",
  ]);
  expect(evidence.serp?.phrase).toBe("digital signage app");
});

it("has no SERP when only off-topic keywords were audited", () => {
  const evidence = clusterEvidence(
    "screen to sign",
    members,
    signals,
    new Set(["digital signage app", "electronic signature app"]),
  );
  expect(evidence.keywords.map((k) => k.phrase)).toEqual(["screen to sign"]);
  expect(evidence.serp).toBeNull();
  expect(evidence.serpAudited).toBe(false);
});

it("asks for a review when more than half of the keywords are off topic", () => {
  expect(needsReview(40, 90, 0.5)).toBe(false);
  expect(needsReview(40, 90, 0.6)).toBe(true);
  expect(needsReview(40, 90)).toBe(false);
});

it("asks the analysis about the keywords with the most searches only", () => {
  const many = Array.from({ length: 100 }, (_, i) =>
    member(`keyword ${i}`, i === 0 ? null : i),
  );
  const asked = analysisKeywords(many);
  expect(asked).toHaveLength(MAX_OFF_TOPIC_KEYWORDS);
  expect(asked[0].phrase).toBe("keyword 99");
  expect(asked.map((k) => k.phrase)).not.toContain("keyword 0");
  expect(analysisKeywords(members).map((k) => k.phrase)).toEqual([
    "electronic signature app",
    "digital signage app",
    "screen to sign",
  ]);
});

it("counts the off-topic share among the keywords the analysis was asked about", () => {
  const many = Array.from({ length: 100 }, (_, i) => member(`k ${i}`, i));
  const marked = new Set(
    analysisKeywords(many)
      .slice(0, 40)
      .map((k) => k.phrase),
  );
  // 40 of the 60 asked, not 40 of 100.
  expect(offTopicShare(marked, many)).toBeCloseTo(40 / 60);
  expect(offTopicShare(new Set(), [])).toBe(0);
});

it("lets the owner's reviews override the analysis's marks", () => {
  expect(
    offTopicMarks(
      ["Adobe Sign ", "e sign app"],
      [
        { phrase: "e sign app", offTopic: false },
        { phrase: "signage monitors", offTopic: true },
      ],
    ),
  ).toEqual(new Set(["adobe sign", "signage monitors"]));
});
