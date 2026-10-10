import type { DATA_SOURCES } from "@repo/db/schema";

// Pure rules for execution numbers (docs/architecture/data-model.md#execution-and-revenue).

type Source = (typeof DATA_SOURCES)[number];

export type RevenueLine = {
  currency: string;
  orders: number;
  grossMinor: number;
  refundMinor: number;
  feesMinor: number | null;
  source: Source;
};

export type CurrencyTotals = {
  currency: string;
  orders: number;
  /** Orders a payment integration verified; manual orders never count here. */
  verifiedOrders: number;
  grossMinor: number;
  refundMinor: number;
  /** Null when any line's fees are unknown: unknown costs are never 0. */
  feesMinor: number | null;
  netMinor: number | null;
};

/** Totals per currency; amounts in different currencies are never added up. */
export function revenueTotals(lines: RevenueLine[]): CurrencyTotals[] {
  const byCurrency = new Map<string, CurrencyTotals>();
  for (const line of lines) {
    const t = byCurrency.get(line.currency) ?? {
      currency: line.currency,
      orders: 0,
      verifiedOrders: 0,
      grossMinor: 0,
      refundMinor: 0,
      feesMinor: 0,
      netMinor: 0,
    };
    t.orders += line.orders;
    if (line.source === "payment_verified") t.verifiedOrders += line.orders;
    t.grossMinor += line.grossMinor;
    t.refundMinor += line.refundMinor;
    t.feesMinor =
      t.feesMinor === null || line.feesMinor === null
        ? null
        : t.feesMinor + line.feesMinor;
    byCurrency.set(line.currency, t);
  }
  return [...byCurrency.values()]
    .map((t) => ({
      ...t,
      netMinor:
        t.feesMinor === null
          ? null
          : t.grossMinor - t.refundMinor - t.feesMinor,
    }))
    .sort((a, b) => a.currency.localeCompare(b.currency));
}

/** Statuses that need a launch date. */
export const LAUNCHED_STATUSES = ["launched", "measuring"] as const;
