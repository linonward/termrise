import { expect, it } from "vitest";

import {
  displayUrl,
  pct,
  reasonMessage,
  shortDate,
  trendSummary,
  usd,
} from "./pool-format";

it("formats money and percents", () => {
  expect(usd(2_000_000)).toBe("$2.00");
  expect(usd(null)).toBe("—");
  expect(pct(-0.0712)).toBe("-7%");
  expect(pct(2.57)).toBe("+257%");
  expect(pct(Infinity)).toBe("—");
});

it("names the part of H6 that failed and the kind of exclusion", () => {
  expect(
    reasonMessage({ rule: "H6", result: "fail", value: "relative_drop" }).key,
  ).toBe("h6.relative_drop");
  expect(
    reasonMessage({ rule: "exclude", result: "fail", value: "offline" }).key,
  ).toBe("exclude.offline");
  expect(
    reasonMessage({ rule: "exclude", result: "fail", value: "a note" }),
  ).toEqual({
    key: "exclude.fail",
    values: { value: "a note", limit: "" },
  });
  expect(
    reasonMessage({
      rule: "H3",
      result: "fail",
      value: 20_000,
      limit: 100_000,
    }),
  ).toEqual({
    key: "H3.fail",
    values: { value: "$0.02", limit: "$0.10" },
  });
});

it("summarizes a trend against its baseline", () => {
  expect(trendSummary(null)).toBeNull();
  expect(
    trendSummary({
      result: "pass",
      months: 60,
      ratio: 1.88,
      yoy: -0.08,
      recentChange: -0.16,
      baseline: { term: "converter", change: -0.1 },
      relativeChange: -0.07,
      categoryDeclining: false,
      rising: false,
      fails: [],
    }),
  ).toEqual({
    recent: "-16%",
    relative: "-7%",
    baseline: "converter",
    ratio: "1.88",
    yoy: "-8%",
  });
});

it("writes short dates, with the year only when it differs", () => {
  const now = new Date(2026, 9, 31);
  expect(shortDate(new Date(2026, 10, 14).toISOString(), now)).toBe("11/14");
  expect(shortDate(new Date(2027, 0, 29).toISOString(), now)).toBe("2027/1/29");
  expect(shortDate(null, now)).toBe("—");
});

it("shows a result's address without the scheme, and none for a Google redirect", () => {
  expect(
    displayUrl(
      "https://www.facerealityskincare.com/pages/pore-clogging-checker/",
    ),
  ).toBe("facerealityskincare.com/pages/pore-clogging-checker");
  expect(displayUrl("https://cryptii.com/")).toBe("cryptii.com");
  expect(displayUrl("https://a.com/x?srsltid=AYCX9&utm_source=g&page=2")).toBe(
    "a.com/x?page=2",
  );
  expect(displayUrl("https://google.com/goto?url=CAES")).toBeNull();
});
