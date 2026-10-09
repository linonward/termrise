import { expect, it } from "vitest";

import { isFirstBatch, opportunityScore } from "./score.mjs";

const all = (n) => ({
  business: n,
  intent: n,
  productFit: n,
  competition: n,
  demand: n,
});

it("maps 1–5 scores to 0–100 by weight", () => {
  expect(opportunityScore(all(5))).toBe(100);
  expect(opportunityScore(all(1))).toBe(0);
  // business weighs 30: 3 of 5 is half of it.
  expect(opportunityScore({ ...all(1), business: 3 })).toBe(15);
});

it("puts a cluster in the first batch only when three scores are 4 or more", () => {
  expect(
    isFirstBatch({ ...all(1), business: 4, intent: 4, productFit: 4 }),
  ).toBe(true);
  expect(isFirstBatch({ ...all(5), productFit: 3 })).toBe(false);
});
