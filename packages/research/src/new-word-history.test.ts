import { expect, it } from "vitest";

import { historyFacts } from "./new-word-history";

const weeks = (f: (i: number) => number, n = 261) =>
  Array.from({ length: n }, (_, i) => ({
    at: new Date(Date.UTC(2021, 10, 21) + i * 7 * 86_400_000).toISOString(),
    value: f(i),
  }));

it("tells a word new to Google from a yearly return and an old word", () => {
  // Nothing for five years, then the last week.
  expect(historyFacts(weeks((i) => (i === 260 ? 100 : 0)))).toMatchObject({
    kind: "new",
    nonzeroWeeks: 1,
    recentMax: 100,
  });
  // A peak every 52 weeks, in late October (Halloween).
  const halloween = historyFacts(
    weeks((i) => (i % 52 === 49 ? 90 : i % 52 > 45 && i % 52 < 51 ? 20 : 1)),
  );
  expect(halloween).toMatchObject({ kind: "seasonal", peakMonth: 10 });
  expect(halloween!.seasonalYears).toBeGreaterThanOrEqual(3);
  // Searched all along.
  expect(historyFacts(weeks(() => 45))).toMatchObject({
    kind: "old",
    mean: 45,
  });
  // Neither: low and flat, no climb.
  expect(historyFacts(weeks((i) => (i % 9 === 0 ? 5 : 0)))).toMatchObject({
    kind: "unclear",
  });
  // Under two years is not enough to say.
  expect(historyFacts(weeks(() => 1, 90))).toBeNull();
});
