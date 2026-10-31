// Rules for new words (docs/product/keyword-pool.md#new-words), version newword-v1:
// how a just-rising query is measured and whether it is worth a page. The thresholds
// are first guesses, set from the maintainer's reference screens; calibrate them.
import type { TrendComparison } from "./keyword-provider";
import { autoExclude } from "./pool-rules";
import { isDedicated } from "./serp-competition";

export const NEW_WORD_RULES = "newword-v1";
/** The reference term: a word's heat is its search interest as a multiple of this one's. */
export const REFERENCE_TERM = "gpts";
/** Heat at or above this, with at most WORTH_MAX_DEDICATED dedicated pages: worth a new site. */
export const WORTH_RATIO = 0.1;
export const WORTH_MAX_DEDICATED = 1;
/** Below this heat a word is not worth even an inner page. */
export const TRY_RATIO = 0.001;
export const TRY_MAX_DEDICATED = 5;
/** Before the burst, a new word had less than this share of its peak. */
export const NEW_SHARE = 0.01;
/** The burst: the first day at this share of the peak. */
export const BURST_SHARE = 0.1;
/** A site registered this recently is a new site. */
export const NEW_SITE_DAYS = 365;

export type Verdict = "worth" | "try" | "skip";
export type BuildAs = "new_site" | "inner_page";
export type VerdictReason = {
  /** For "excluded": offline, shopping or downloads. */
  kind?: string;
  code:
    | "no_dedicated"
    | "few_dedicated"
    | "many_dedicated"
    | "hot"
    | "warm"
    | "cold"
    | "rising"
    | "falling"
    | "new_word"
    | "excluded";
  value?: number;
};

export type CurveFacts = {
  /** The word's daily interest, oldest first, on the reference's scale. */
  days: { day: string; value: number }[];
  peakDay: string | null;
  burstDay: string | null;
  /** Mean before the burst over the peak; under NEW_SHARE the word is new. */
  preBurstShare: number | null;
  isNew: boolean;
  /** The last 7 days start from (almost) nothing. */
  fromZero: boolean;
  rising: boolean;
  /** Interest over the reference's on the latest day the reference has data. */
  ratio: number | null;
  ratioDay: string | null;
};

const mean = (xs: number[]) =>
  xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;

/** Facts from a daily comparison of [word, reference] (trendCompare, past 30 days). */
export function curveFacts(comparison: TrendComparison): CurveFacts {
  const byDay = new Map<string, [number, number]>();
  for (const p of comparison) {
    const day = p.at.slice(0, 10);
    const [w, r] = byDay.get(day) ?? [0, 0];
    byDay.set(day, [w + (p.values[0] ?? 0), r + (p.values[1] ?? 0)]);
  }
  const rows = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b));
  const days = rows.map(([day, [w]]) => ({ day, value: w }));
  const peak = Math.max(0, ...days.map((d) => d.value));
  const empty: CurveFacts = {
    days,
    peakDay: null,
    burstDay: null,
    preBurstShare: null,
    isNew: false,
    fromZero: false,
    rising: false,
    ratio: null,
    ratioDay: null,
  };
  if (peak === 0) return empty;
  const peakDay = days.find((d) => d.value === peak)!.day;
  const burstIndex = days.findIndex((d) => d.value >= peak * BURST_SHARE);
  const preBurstShare =
    mean(days.slice(0, burstIndex).map((d) => d.value)) / peak;
  const last7 = days.slice(-7);
  const latest = [...rows].reverse().find(([, [, r]]) => r > 0);
  return {
    ...empty,
    peakDay,
    burstDay: days[burstIndex].day,
    preBurstShare,
    isNew: burstIndex > 0 && preBurstShare < NEW_SHARE,
    fromZero: last7.length > 0 && last7[0].value <= peak * NEW_SHARE,
    rising:
      mean(days.slice(-3).map((d) => d.value)) >
      mean(days.slice(-6, -3).map((d) => d.value)),
    ratio: latest ? latest[1][0] / latest[1][1] : null,
    ratioDay: latest ? latest[0] : null,
  };
}

/** Pages in the results made for this phrase: its words in the title or the address. */
export function dedicatedPages(
  phrase: string,
  results: { url: string; title: string }[],
) {
  const slug = phrase.toLowerCase().split(/\s+/);
  return results.filter((r) => {
    if (isDedicated(r.title, phrase)) return true;
    const path = decodeURIComponent(r.url.toLowerCase()).replace(
      /[^a-z0-9]+/g,
      " ",
    );
    return slug.every((w) => path.includes(w));
  }).length;
}

/** Whether a new word is worth a page, and which kind. */
export function newWordVerdict(input: {
  phrase: string;
  ratio: number | null;
  dedicated: number;
  rising: boolean;
  isNew: boolean;
}): { verdict: Verdict; buildAs: BuildAs | null; reasons: VerdictReason[] } {
  const { ratio, dedicated, rising, isNew } = input;
  // The evergreen exclusions hold here too: offline services, shopping, someone else's downloads.
  const excluded = autoExclude(input.phrase);
  if (excluded)
    return {
      verdict: "skip",
      buildAs: null,
      reasons: [{ code: "excluded", value: undefined, kind: excluded }],
    };
  const heat = ratio ?? 0;
  const reasons: VerdictReason[] = [
    {
      code:
        dedicated === 0
          ? "no_dedicated"
          : dedicated <= TRY_MAX_DEDICATED
            ? "few_dedicated"
            : "many_dedicated",
      value: dedicated,
    },
    {
      code: heat >= WORTH_RATIO ? "hot" : heat >= TRY_RATIO ? "warm" : "cold",
      value: Math.round(heat * 1000) / 1000,
    },
    { code: rising ? "rising" : "falling" },
    ...(isNew ? [{ code: "new_word" as const }] : []),
  ];
  if (heat >= WORTH_RATIO && dedicated <= WORTH_MAX_DEDICATED && rising)
    return { verdict: "worth", buildAs: "new_site", reasons };
  if (heat >= TRY_RATIO && dedicated <= TRY_MAX_DEDICATED && rising)
    return { verdict: "try", buildAs: "inner_page", reasons };
  return { verdict: "skip", buildAs: null, reasons };
}
