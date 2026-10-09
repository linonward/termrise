import { expect, it } from "vitest";

import { refundCredits } from "./flow";

it.each([
  ["no refund amount", undefined, 1990, 50],
  ["the full amount", 1990, 1990, 50],
  ["more than paid", 2100, 1990, 50],
  ["half, rounded up", 995, 1990, 25],
  ["a small part, rounded up", 100, 1990, 3],
  ["almost nothing", 1, 1990, 1],
])("refundCredits: %s", (_, refunded, paid, expected) => {
  expect(refundCredits(50, refunded, paid)).toBe(expected);
});
