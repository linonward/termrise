import type { Reason } from "@repo/research/pool-rules";
import type { TrendCheck } from "@repo/research/pool-trend";

// Formatting for the keyword pool pages (docs/product/keyword-pool.md).

/** Micro-USD as dollars, e.g. 2_000_000 → "$2.00". */
export const usd = (micros: number | null | undefined, digits = 2) =>
  micros == null ? "—" : `$${(micros / 1_000_000).toFixed(digits)}`;

/** A share as a signed percent, e.g. -0.07 → "-7%". */
export const pct = (x: number | null | undefined) =>
  x == null || !Number.isFinite(x)
    ? "—"
    : `${x > 0 ? "+" : ""}${Math.round(x * 100)}%`;

export const count = (n: number | null | undefined) =>
  n == null ? "—" : n.toLocaleString("en-US");

/** The message key and values of a reason; the page passes them to next-intl. */
export function reasonMessage(reason: Reason): {
  key: string;
  values: Record<string, string>;
} {
  const value = reason.value;
  const values: Record<string, string> = {
    value:
      reason.rule === "H3" && typeof value === "number"
        ? usd(value)
        : value == null
          ? ""
          : String(value),
    limit:
      reason.rule === "H3" && reason.limit !== undefined
        ? usd(reason.limit)
        : String(reason.limit ?? ""),
  };
  // H6 fails name which of its three parts failed; exclusions name the kind.
  if (
    reason.rule === "H6" &&
    reason.result === "fail" &&
    typeof value === "string"
  )
    return { key: `h6.${value}`, values };
  if (
    reason.rule === "exclude" &&
    typeof value === "string" &&
    ["offline", "shopping", "downloads"].includes(value)
  )
    return { key: `exclude.${value}`, values };
  return { key: `${reason.rule}.${reason.result}`, values };
}

/** The trend in one line: relative change when there is a baseline, else absolute. */
export function trendSummary(trend: TrendCheck | null) {
  if (!trend || trend.recentChange === null) return null;
  return {
    recent: pct(trend.recentChange),
    relative: trend.relativeChange === null ? null : pct(trend.relativeChange),
    baseline: trend.baseline?.term ?? null,
    ratio: trend.ratio === null ? "—" : trend.ratio.toFixed(2),
    yoy: pct(trend.yoy),
  };
}
