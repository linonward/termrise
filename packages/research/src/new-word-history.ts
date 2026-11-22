// A word's five years on Google (docs/product/keyword-pool.md#history, S95): is it new
// at all? Weekly interest of the word alone (its own peak is 100), US, from Google Trends.
// A word that only looks new on 90 days is often a yearly return (halloween filter) or
// an old word lifted again (remove video background).

/** Five-year mean at or below this, with a recent climb, is a word new to Google. */
export const NEW_MAX_MEAN = 2;
/** A recent week this high (of 100) is the climb that makes a new word. */
export const NEW_RECENT_MIN = 50;
/** Five-year mean from this up is an old word that rose again. */
export const OLD_MIN_MEAN = 20;
/** A year counts as a seasonal peak at this level, and this far above its median. */
const SEASON_PEAK_MIN = 30;
const SEASON_PEAK_RATIO = 3;
/** Peaks of different years within this many weeks of the same week of the year. */
const SEASON_WEEKS = 6;
const SEASON_YEARS = 3;

export type HistoryKind = "new" | "seasonal" | "old" | "unclear";

export type History = {
  kind: HistoryKind;
  weeks: number;
  mean: number;
  nonzeroWeeks: number;
  /** The first week with any interest in the five years. */
  firstWeek: string | null;
  /** Highest week of the last four. */
  recentMax: number;
  /** For a seasonal word: the month (1 to 12) its peaks fall in. */
  peakMonth: number | null;
  /** Years whose peak lines up with the others. */
  seasonalYears: number;
};

const weekOfYear = (iso: string) => {
  const d = new Date(iso);
  const start = Date.UTC(d.getUTCFullYear(), 0, 1);
  return Math.floor((d.getTime() - start) / (7 * 86_400_000));
};

/** Classifies five years of weekly points (oldest first). Null with under two years. */
export function historyFacts(
  points: { at: string; value: number }[],
): History | null {
  if (points.length < 104) return null;
  const values = points.map((p) => p.value);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const nonzero = points.filter((p) => p.value > 0);
  const recentMax = Math.max(...values.slice(-4));
  // One peak per 52-week block, newest block last.
  const peaks: { at: string; value: number }[] = [];
  for (let end = points.length; end - 52 >= 0; end -= 52) {
    const block = points.slice(end - 52, end);
    const sorted = [...block.map((p) => p.value)].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const top = block.reduce((a, b) => (b.value > a.value ? b : a));
    if (
      top.value >= SEASON_PEAK_MIN &&
      top.value >= SEASON_PEAK_RATIO * Math.max(1, median)
    )
      peaks.push(top);
  }
  // The largest group of peaks on about the same week of the year.
  let seasonalYears = 0;
  let anchor: string | null = null;
  for (const p of peaks) {
    const w = weekOfYear(p.at);
    const near = peaks.filter((q) => {
      const d = Math.abs(weekOfYear(q.at) - w);
      return Math.min(d, 52 - d) <= SEASON_WEEKS;
    }).length;
    if (near > seasonalYears) {
      seasonalYears = near;
      anchor = p.at;
    }
  }
  const kind: HistoryKind =
    mean >= OLD_MIN_MEAN
      ? "old"
      : seasonalYears >= SEASON_YEARS
        ? "seasonal"
        : mean <= NEW_MAX_MEAN && recentMax >= NEW_RECENT_MIN
          ? "new"
          : "unclear";
  return {
    kind,
    weeks: points.length,
    mean: Math.round(mean * 10) / 10,
    nonzeroWeeks: nonzero.length,
    firstWeek: nonzero[0]?.at.slice(0, 10) ?? null,
    recentMax,
    peakMonth:
      kind === "seasonal" && anchor ? new Date(anchor).getUTCMonth() + 1 : null,
    seasonalYears,
  };
}
