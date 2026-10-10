import { expect, it } from "vitest";

import { revenueTotals } from "./execution-rules";

const line = {
  currency: "USD",
  orders: 2,
  grossMinor: 1800,
  refundMinor: 0,
  feesMinor: 120,
  source: "manual" as const,
};

it("adds up per currency and computes net only when every fee is known", () => {
  expect(
    revenueTotals([
      line,
      { ...line, orders: 1, grossMinor: 900, refundMinor: 900, feesMinor: 60 },
      { ...line, currency: "EUR", feesMinor: null },
    ]),
  ).toEqual([
    {
      currency: "EUR",
      orders: 2,
      verifiedOrders: 0,
      grossMinor: 1800,
      refundMinor: 0,
      feesMinor: null,
      netMinor: null,
    },
    {
      currency: "USD",
      orders: 3,
      verifiedOrders: 0,
      grossMinor: 2700,
      refundMinor: 900,
      feesMinor: 180,
      netMinor: 1620,
    },
  ]);
});

it("counts only payment_verified orders as verified", () => {
  const [usd] = revenueTotals([
    line,
    { ...line, orders: 5, source: "payment_verified" },
  ]);
  expect(usd).toMatchObject({ orders: 7, verifiedOrders: 5 });
});

it("keeps net unknown once one fee is unknown, whatever the order", () => {
  const [usd] = revenueTotals([{ ...line, feesMinor: null }, line]);
  expect(usd).toMatchObject({ feesMinor: null, netMinor: null });
});
