import { expect, it } from "vitest";

import { lowestPerUseCents, packPricing, planPricing } from "./pack-pricing";

it("derives uses, per-use price and the saving against Single", () => {
  expect(packPricing("single", 1)).toEqual({
    uses: 10,
    perUseCents: 59,
    savingPercent: null,
  });
  expect(packPricing("starter", 1)).toEqual({
    uses: 50,
    perUseCents: 40,
    savingPercent: 32,
  });
  expect(packPricing("creator", 1)).toEqual({
    uses: 150,
    perUseCents: 33,
    savingPercent: 43,
  });
  expect(packPricing("pro", 1)).toEqual({
    uses: 280,
    perUseCents: 29,
    savingPercent: 51,
  });
});

it("the lowest per-use price is the Pro pack's", () => {
  expect(lowestPerUseCents(1)).toBe(29);
});

it("divides by the credits one use costs", () => {
  expect(packPricing("creator", 10)).toMatchObject({
    uses: 15,
    perUseCents: 333,
  });
});

it("derives a plan's runs per period and its saving against Single", () => {
  expect(planPricing("monthly", 1)).toEqual({
    uses: 60,
    perUseCents: 17,
    savingPercent: 72,
  });
  expect(planPricing("monthly", 10)).toMatchObject({ uses: 6 });
});
