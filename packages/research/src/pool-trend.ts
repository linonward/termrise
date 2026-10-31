// H6 of the tool-site rules (docs/product/keyword-pool.md#rules): a keyword's search
// interest must be steady, not halving, and not falling much faster than its seed's.
// Input is weekly Google Trends interest for the past 5 years (searchTrend()).
import type { TrendPoint } from "./keyword-provider";
import { MAX_TREND_RATIO } from "./pool-rules";

/** H6 ②: the last 12 months may be at most this much below the 12 before. */
export const MIN_YOY = -0.5;
/** H6 ③ without a baseline: the last 3 months against the same 3 a year earlier. */
export const MAX_RECENT_DROP = -0.3;
/** H6 ③ with a baseline: how much faster than the seed the keyword may fall. */
export const MAX_RELATIVE_DROP = -0.2;
/** The seed itself falling this fast marks the whole category as declining (a note). */
export const CATEGORY_DECLINE = -0.4;
/** A keyword up this much against a year ago is rising, so a high ratio is not seasonal. */
export const RISING = 0.5;
const MIN_MONTHS = 24;
const MIN_BASELINE_MONTHS = 15;

export type Baseline = { term: string; change: number };
export type TrendFail = "ratio" | "yoy" | "recent_drop" | "relative_drop";
export type TrendCheck = {
  result: "pass" | "fail" | "unsure";
  months: number;
  ratio: number | null;
  yoy: number | null;
  recentChange: number | null;
  baseline: Baseline | null;
  relativeChange: number | null;
  categoryDeclining: boolean;
  rising: boolean;
  fails: TrendFail[];
};

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** Monthly averages, oldest first, without the last (partial) month. */
export function monthlyAverages(points: TrendPoint[]) {
  const byMonth = new Map<string, number[]>();
  for (const p of points) {
    const key = p.week.slice(0, 7);
    byMonth.set(key, [...(byMonth.get(key) ?? []), p.value]);
  }
  return [...byMonth.values()].map(mean).slice(0, -1);
}

const recent = (months: number[]) =>
  mean(months.slice(-3)) / mean(months.slice(-15, -12)) - 1;

/** The seed's own last-3-month change, the baseline for H6 ③; null without the data. */
export function baselineChange(points: TrendPoint[]) {
  const months = monthlyAverages(points);
  return months.length < MIN_BASELINE_MONTHS ? null : recent(months);
}

export function trendCheck(
  points: TrendPoint[],
  baseline?: Baseline,
): TrendCheck {
  const months = monthlyAverages(points);
  const empty: TrendCheck = {
    result: "unsure",
    months: months.length,
    ratio: null,
    yoy: null,
    recentChange: null,
    baseline: baseline ?? null,
    relativeChange: null,
    categoryDeclining: false,
    rising: false,
    fails: [],
  };
  if (months.length < MIN_MONTHS) return empty;
  const last12 = months.slice(-12);
  const low = Math.min(...last12);
  const ratio = low > 0 ? Math.max(...last12) / low : Infinity;
  const yoy = mean(last12) / mean(months.slice(-24, -12)) - 1;
  const recentChange = recent(months);
  const relativeChange = baseline
    ? (1 + recentChange) / (1 + baseline.change) - 1
    : null;
  const fails: TrendFail[] = [];
  if (ratio >= MAX_TREND_RATIO) fails.push("ratio");
  if (yoy < MIN_YOY) fails.push("yoy");
  if (relativeChange === null) {
    if (recentChange < MAX_RECENT_DROP) fails.push("recent_drop");
  } else if (relativeChange < MAX_RELATIVE_DROP) fails.push("relative_drop");
  return {
    ...empty,
    result: fails.length > 0 ? "fail" : "pass",
    ratio,
    yoy,
    recentChange,
    relativeChange,
    categoryDeclining: !!baseline && baseline.change < CATEGORY_DECLINE,
    rising: recentChange >= RISING,
    fails,
  };
}
