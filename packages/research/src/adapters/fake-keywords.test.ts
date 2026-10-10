import { expect, it } from "vitest";

import {
  createFakeKeywordProvider,
  FAKE_KEYWORDS_FAILURE,
} from "./fake-keywords";

const market = { locationCode: 2840, languageCode: "en" };
const provider = createFakeKeywordProvider();

it("expands a seed into the same ideas every time, the seed first", async () => {
  const first = await provider.expand("meeting notes", market);
  expect(first[0].phrase).toBe("meeting notes");
  expect(first).toHaveLength(8);
  expect(await provider.expand("meeting notes", market)).toEqual(first);
});

it("keeps metrics in range and uses null for missing data", async () => {
  const ideas = (
    await Promise.all(
      ["a", "b", "c", "d", "e", "f", "g", "h"].map((seed) =>
        provider.expand(`seed ${seed}`, market),
      ),
    )
  ).flat();
  for (const { metrics } of ideas) {
    for (const value of [metrics.adsCompetition, metrics.keywordDifficulty])
      if (value !== null) expect(value).toBeGreaterThanOrEqual(0);
    if (metrics.keywordDifficulty !== null)
      expect(metrics.keywordDifficulty).toBeLessThanOrEqual(100);
  }
  expect(ideas.some((i) => i.metrics.searchVolume === null)).toBe(true);
  expect(ideas.some((i) => i.metrics.keywordDifficulty === null)).toBe(true);
});

it("returns ten organic results on .invalid domains", async () => {
  const results = await provider.serp("meeting notes", market);
  expect(results.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  for (const r of results)
    expect(new URL(r.url).hostname).toMatch(/\.fixture\.invalid$/);
});

it("fails on the failure marker", async () => {
  await expect(
    provider.expand(`x ${FAKE_KEYWORDS_FAILURE}`, market),
  ).rejects.toThrow();
});
