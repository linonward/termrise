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
/**
 * Days from the word's burst to the day Termrise found it (UTC dates): how late the
 * discovery was. Negative when it was found before the burst; null without a burst day.
 */
export const discoveryLag = (firstSeenAt: string, burstDay: string | null) =>
  burstDay
    ? Math.round(
        (Date.parse(firstSeenAt.slice(0, 10)) - Date.parse(burstDay)) /
          86_400_000,
      )
    : null;

/** The message key and value that say the lag, e.g. lag.late with 7. */
export const lagMessage = (lag: number) =>
  lag > 0
    ? ({ key: "late", days: lag } as const)
    : lag < 0
      ? ({ key: "early", days: -lag } as const)
      : ({ key: "same", days: 0 } as const);

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

/** The 7-day growth as a signed percent, e.g. 34.5 → "+3,450%". */
export const growthPct = (growth: number) =>
  `${growth >= 0 ? "+" : ""}${Math.round(growth * 100).toLocaleString("en-US")}%`;

export type WordStage = "decide" | "check" | "screen" | "skip" | "hidden";

/** The list stage a word sits in, as the API filters it (packages/research new-words.ts). */
export function wordStage(w: {
  verdict: string | null;
  ratio: number | null;
  hidden: boolean;
}): WordStage {
  if (w.hidden) return "hidden";
  if (w.verdict === "worth" || w.verdict === "try") return "decide";
  if (w.verdict === "skip") return "skip";
  return w.ratio == null ? "screen" : "check";
}

export const NAME_SOURCES = [
  "hugging_face",
  "itch_io",
  "trending_now",
  "show_hn",
  "product_hunt",
  "github",
] as const;

/** A free list ("source:itch_io"), a root's Google suggestion ("suggest:x") or a rising root. */
export function rootSource(
  root: string,
):
  | { source: (typeof NAME_SOURCES)[number] }
  | { suggest: string }
  | { root: string } {
  if (root.startsWith("suggest:")) return { suggest: root.slice(8) };
  const key = root.startsWith("source:") ? root.slice(7) : null;
  const source = NAME_SOURCES.find((s) => s === key);
  return source ? { source } : { root };
}

/** The message that names where a word came from (newWords.nameSource, rootSuggest, rootRising). */
export function rootMessage(root: string) {
  const s = rootSource(root);
  if ("source" in s)
    return {
      key: `nameSource.${s.source}` as const,
      values: {} as Record<string, string>,
    };
  if ("suggest" in s)
    return { key: "rootSuggest" as const, values: { root: s.suggest } };
  return { key: "rootRising" as const, values: { root: s.root } };
}

/** The word against gpts in Google Trends' explore page (the new address since 2026). */
export const trendsUrl = (phrase: string) =>
  `https://trends.google.com/explore?q=${encodeURIComponent(phrase)},gpts&geo=US`;
