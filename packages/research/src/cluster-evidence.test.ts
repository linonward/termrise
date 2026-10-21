import { expect, it } from "vitest";

import { clusterEvidence, type ClusterMember } from "./cluster-evidence";
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
