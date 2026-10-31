import { expect, it } from "vitest";

import { baselineChange, trendCheck } from "./pool-trend";
import average from "./testing/trends/average-calculator.json";
import calculator from "./testing/trends/calculator.json";
import cipher from "./testing/trends/cipher-decoder.json";
import converter from "./testing/trends/converter.json";
import dividend from "./testing/trends/dividend-calculator.json";
import gravel from "./testing/trends/gravel-calculator.json";
import titleCase from "./testing/trends/title-case-converter.json";

// Real Google Trends curves from keyword-lab rounds (2026-10-04 and 2026-10-31); the
// expected numbers are what keyword-lab's trends.ts computed for the same files.
const pct = (x: number | null | undefined) => Math.round((x ?? NaN) * 100);

it("judges a keyword against its seed, not on its own (H6 ③)", () => {
  const base = baselineChange(calculator.points)!;
  expect(pct(base)).toBe(-23);
  const result = trendCheck(average.points, {
    term: "calculator",
    change: base,
  });
  expect(result.result).toBe("pass");
  expect(pct(result.recentChange)).toBe(-36);
  expect(pct(result.relativeChange)).toBe(-17);
  const falls = trendCheck(dividend.points, {
    term: "calculator",
    change: base,
  });
  expect(falls.result).toBe("fail");
  expect(falls.fails).toEqual(["relative_drop"]);
  expect(pct(falls.relativeChange)).toBe(-35);
});

it("uses the absolute rule without a baseline and says so", () => {
  const result = trendCheck(average.points);
  expect(result).toMatchObject({ result: "fail", fails: ["recent_drop"] });
  expect(result.relativeChange).toBeNull();
});

it("fails a seasonal curve on the 12-month ratio (H6 ①)", () => {
  const result = trendCheck(gravel.points, {
    term: "calculator",
    change: baselineChange(calculator.points)!,
  });
  expect(result.fails).toEqual(["ratio"]);
  expect(result.ratio).toBeCloseTo(3.05, 2);
});

it("passes cipher decoder against converter, as in the 2026-10-31 round", () => {
  const base = baselineChange(converter.points)!;
  const result = trendCheck(cipher.points, { term: "converter", change: base });
  expect(result).toMatchObject({ result: "pass", fails: [] });
  expect(result.ratio).toBeCloseTo(1.88, 2);
  expect([pct(result.yoy), pct(result.recentChange)]).toEqual([-8, -16]);
  expect(pct(result.relativeChange)).toBe(-7);
  expect(result.categoryDeclining).toBe(false);
});

it("flags a fast-rising keyword: it fails the ratio, but is rising, not seasonal", () => {
  const result = trendCheck(titleCase.points, {
    term: "converter",
    change: baselineChange(converter.points)!,
  });
  expect(result.fails).toEqual(["ratio"]);
  expect(pct(result.recentChange)).toBe(257);
  expect(result.rising).toBe(true);
});

it("is unsure with less than 24 months of data", () => {
  expect(trendCheck(cipher.points.slice(-60)).result).toBe("unsure");
  expect(baselineChange(cipher.points.slice(-40))).toBeNull();
});
