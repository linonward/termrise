import { expect, it } from "vitest";

import {
  discoveryLag,
  growthPct,
  lagMessage,
  linePoints,
  monthDay,
  times,
  verdictReason,
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
