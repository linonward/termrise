import { expect, it } from "vitest";

import {
  daysSince,
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
  expect(
    daysSince("2026-10-29T08:00:00Z", new Date("2026-10-31T08:00:00Z")),
  ).toBe(2);
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
