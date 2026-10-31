import type { VerdictReason } from "@repo/research/new-word-rules";

// Formatting for new words (docs/product/keyword-pool.md#new-words).

/** "×0.554"; small values keep three significant digits. */
export const times = (ratio: number | null | undefined) =>
  ratio == null
    ? "—"
    : `×${ratio >= 0.01 ? ratio.toFixed(3) : ratio.toPrecision(2)}`;

/** "10/29" from an ISO date or time. */
export const monthDay = (iso: string | null | undefined) =>
  iso ? `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}` : "—";

/** Whole days between an ISO time and now, at least 1. */
export const daysSince = (iso: string, now = new Date()) =>
  Math.max(
    1,
    Math.round((now.getTime() - new Date(iso).getTime()) / 86_400_000),
  );

/** The message key and values of a verdict reason. */
export function verdictReason(reason: VerdictReason) {
  return { key: reason.code, values: { value: String(reason.value ?? "") } };
}

/** Points for a sparkline or chart: x from 0 to width, y from height (0) to 0 (peak). */
export function linePoints(values: number[], width: number, height: number) {
  if (values.length === 0) return [];
  const peak = Math.max(1, ...values);
  const step = values.length > 1 ? width / (values.length - 1) : 0;
  return values.map((v, i) => [
    Math.round(i * step * 10) / 10,
    Math.round((height - (v / peak) * height) * 10) / 10,
  ]);
}
