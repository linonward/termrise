import { describe, expect, it } from "vitest";

import {
  discoveryLag,
  growthPct,
  lagMessage,
  linePoints,
  monthDay,
  rootSource,
  times,
  trendsUrl,
  verdictReason,
  wordStage,
} from "./new-word-format";

it("formats heat, dates and ages", () => {
  expect(times(0.554)).toBe("×0.554");
  expect(times(0.0031)).toBe("×0.0031");
  expect(times(null)).toBe("—");
  expect(monthDay("2026-10-29")).toBe("10/29");
});

it("says how many days after its burst a word was found", () => {
  expect(discoveryLag("2026-10-31T02:00:00.000Z", "2026-10-24")).toBe(7);
  expect(discoveryLag("2026-10-24T23:00:00.000Z", "2026-10-24")).toBe(0);
  expect(discoveryLag("2026-10-20T02:00:00.000Z", "2026-10-24")).toBe(-4);
  expect(discoveryLag("2026-10-31T02:00:00.000Z", null)).toBeNull();
  expect(lagMessage(7)).toEqual({ key: "late", days: 7 });
  expect(lagMessage(0)).toEqual({ key: "same", days: 0 });
  expect(lagMessage(-4)).toEqual({ key: "early", days: 4 });
});

it("draws a line from zero to the peak", () => {
  expect(linePoints([0, 5, 10], 100, 20)).toEqual([
    [0, 20],
    [50, 10],
    [100, 0],
  ]);
  expect(linePoints([], 100, 20)).toEqual([]);
});

it("names a reason by its code", () => {
  expect(verdictReason({ code: "hot", value: 0.554 })).toEqual({
    key: "hot",
    values: { value: "0.554" },
  });
});

it("writes the 7-day growth as a percent", () => {
  expect(growthPct(34.5)).toBe("+3,450%");
  expect(growthPct(-0.25)).toBe("-25%");
  expect(growthPct(0)).toBe("+0%");
});

describe("wordStage", () => {
  const word = (w: Partial<Parameters<typeof wordStage>[0]>) => ({
    verdict: null,
    ratio: null,
    hidden: false,
    ...w,
  });
  it("puts a word where the list shows it", () => {
    expect(wordStage(word({}))).toBe("screen");
    expect(wordStage(word({ ratio: 0.4 }))).toBe("check");
    expect(wordStage(word({ ratio: 0.4, verdict: "worth" }))).toBe("decide");
    expect(wordStage(word({ ratio: 0.4, verdict: "try" }))).toBe("decide");
    expect(wordStage(word({ verdict: "skip" }))).toBe("skip");
    expect(wordStage(word({ verdict: "worth", hidden: true }))).toBe("hidden");
  });
});

describe("rootSource", () => {
  it("names the free lists and keeps search roots as they are", () => {
    expect(rootSource("source:trending_now")).toEqual({
      source: "trending_now",
    });
    expect(rootSource("calculator")).toEqual({ root: "calculator" });
    expect(rootSource("source:product_hunt")).toEqual({
      source: "product_hunt",
    });
    expect(rootSource("source:github")).toEqual({ source: "github" });
    expect(rootSource("suggest:calculator")).toEqual({ suggest: "calculator" });
  });
});

describe("trendsUrl", () => {
  it("opens the word against gpts in the new Google Trends explore page", () => {
    expect(trendsUrl("ai video")).toBe(
      "https://trends.google.com/explore?q=ai%20video,gpts&geo=US",
    );
  });
});
