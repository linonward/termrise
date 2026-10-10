// Lifecycle of a radar item (docs/product/product.md#f02-趋势生命周期), from discussion
// counts only: points over time, and when the same term was seen before. Deterministic
// and versioned; growth needs enough comparable observations, else insufficient_data.

export const LIFECYCLE_VERSION = "lifecycle-v1";
export const LIFECYCLES = [
  "breakout",
  "emerging",
  "sustained",
  "recurring",
  "seasonal",
  "insufficient_data",
] as const;
export type Lifecycle = (typeof LIFECYCLES)[number];

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
/** Fewer observations, or a shorter span, is not enough to measure growth. */
export const MIN_OBSERVATIONS = 3;
export const MIN_SPAN_MS = 3 * HOUR_MS;
/** Growth is the points gained over this window, ending at the last observation. */
export const GROWTH_WINDOW_MS = 6 * HOUR_MS;
export const BREAKOUT_GAIN = 100;
export const EMERGING_GAIN = 20;
/** Seen for at least this long without growth: sustained. */
export const SUSTAINED_SPAN_MS = DAY_MS;
/** The same term seen again at least this long after an earlier item: recurring. */
export const RECURRING_GAP_MS = 7 * DAY_MS;

export type LifecycleInput = {
  firstSeenAt: Date;
  /** Points over time, any order; null points are not comparable and are ignored. */
  observations: { observedAt: Date; score: number | null }[];
  /** First-seen times of other radar items with the same term. */
  earlierSightings: Date[];
};

export function lifecycle(input: LifecycleInput): Lifecycle {
  const earlier = input.earlierSightings.filter(
    (at) => input.firstSeenAt.getTime() - at.getTime() >= RECURRING_GAP_MS,
  );
  // The term came back in the same month of another year.
  if (
    earlier.some(
      (at) =>
        at.getUTCMonth() === input.firstSeenAt.getUTCMonth() &&
        at.getUTCFullYear() < input.firstSeenAt.getUTCFullYear(),
    )
  )
    return "seasonal";
  if (earlier.length > 0) return "recurring";

  const points = input.observations
    .filter((o): o is { observedAt: Date; score: number } => o.score !== null)
    .sort((a, b) => a.observedAt.getTime() - b.observedAt.getTime());
  if (points.length < MIN_OBSERVATIONS) return "insufficient_data";
  const first = points[0];
  const last = points[points.length - 1];
  const span = last.observedAt.getTime() - first.observedAt.getTime();
  if (span < MIN_SPAN_MS) return "insufficient_data";

  // The newest observation at or before the window start; the first one if none.
  const start = last.observedAt.getTime() - GROWTH_WINDOW_MS;
  const base =
    [...points].reverse().find((p) => p.observedAt.getTime() <= start) ?? first;
  const gain = last.score - base.score;
  if (gain >= BREAKOUT_GAIN) return "breakout";
  if (gain >= EMERGING_GAIN) return "emerging";
  if (span >= SUSTAINED_SPAN_MS) return "sustained";
  return "insufficient_data";
}
