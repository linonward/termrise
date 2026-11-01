// Rules for new words (docs/product/keyword-pool.md#new-words), version newword-v1:
// how a just-rising query is measured and whether it is worth a page. The thresholds
// are first guesses, set from the maintainer's reference screens; calibrate them.
import type { TrendComparison } from "./keyword-provider";
import { autoExclude } from "./pool-rules";
import { isDedicated } from "./serp-competition";

// v2 (S68): heat is the last 7 days' average; a one-day spike is at most worth a try.
// v3 (S75): the maker's own page and platform listings are not competition.
export const NEW_WORD_RULES = "newword-v3";
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
/** A spike: one day holds more than this share of the last 7 days' interest. */
export const SPIKE_SHARE = 0.6;
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
    | "spike"
    | "excluded"
    | "official"
    | "category";
  /** For "category": the class that is not built for (news, entertainment...). */
  category?: string;
  value?: number;
};

export type CurveFacts = {
  /** The word's daily interest, oldest first, on the reference's scale. */
  days: { day: string; value: number }[];
  peakDay: string | null;
  burstDay: string | null;
  /** The first day with any interest in the curve (90 days): when it appeared. */
  firstDay: string | null;
  /** The last 7 days' interest over the 7 before, minus 1; null when those were 0. */
  growth7: number | null;
  spike: boolean;
  /** Mean before the burst over the peak; under NEW_SHARE the word is new. */
  preBurstShare: number | null;
  isNew: boolean;
  /** The last 7 days start from (almost) nothing. */
  fromZero: boolean;
  rising: boolean;
  /** Interest over the reference's, both summed over the last 7 days with reference data. */
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
    firstDay: null,
    growth7: null,
    spike: false,
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
  const sum = (xs: { value: number }[]) => xs.reduce((a, d) => a + d.value, 0);
  const week = sum(last7);
  const before = sum(days.slice(-14, -7));
  const withRef = rows.filter(([, [, r]]) => r > 0).slice(-7);
  const refWeek = withRef.reduce((a, [, [, r]]) => a + r, 0);
  return {
    ...empty,
    peakDay,
    burstDay: days[burstIndex].day,
    firstDay: days.find((d) => d.value > 0)!.day,
    growth7: before > 0 ? week / before - 1 : null,
    spike:
      week > 0 && Math.max(...last7.map((d) => d.value)) > week * SPIKE_SHARE,
    preBurstShare,
    isNew: burstIndex > 0 && preBurstShare < NEW_SHARE,
    fromZero: last7.length > 0 && last7[0].value <= peak * NEW_SHARE,
    rising:
      mean(days.slice(-3).map((d) => d.value)) >
      mean(days.slice(-6, -3).map((d) => d.value)),
    ratio:
      refWeek > 0 ? withRef.reduce((a, [, [w]]) => a + w, 0) / refWeek : null,
    ratioDay: withRef.at(-1)?.[0] ?? null,
  };
}

/** One word's curve, as [word, reference], out of a comparison of up to five terms. */
export function splitComparison(
  comparison: TrendComparison,
  index: number,
  refIndex: number,
): TrendComparison {
  return comparison.map((p) => ({
    at: p.at,
    values: [p.values[index] ?? 0, p.values[refIndex] ?? 0],
  }));
}

/** Whether a word is worth the paid search-result checks: warm enough, rising, allowed. */
export function passesScreen(input: {
  phrase: string;
  ratio: number | null;
  rising: boolean;
}) {
  return (
    !autoExclude(input.phrase) &&
    (input.ratio ?? 0) >= TRY_RATIO &&
    input.rising
  );
}

// Hosts where a name is listed or talked about, not a site built to compete for it.
const PLATFORM_HOSTS = [
  "huggingface.co",
  "github.com",
  "github.io",
  "itch.io",
  "apps.apple.com",
  "play.google.com",
  "store.steampowered.com",
  "steamcommunity.com",
  "producthunt.com",
  "npmjs.com",
  "pypi.org",
  "chromewebstore.google.com",
  "chrome.google.com",
  "roblox.com",
  "news.ycombinator.com",
  "reddit.com",
  "x.com",
  "twitter.com",
  "youtube.com",
  "tiktok.com",
  "instagram.com",
  "facebook.com",
  "linkedin.com",
  "discord.com",
  "wikipedia.org",
];
/** Categories that name a thing (a model, a game), whose maker's site is official. */
const NAMED = new Set(["ai", "game"]);

const compact = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

function hostOf(url: string) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

/**
 * What a result is for this phrase (S75): "official" (the maker's own site, or a listing on
 * a platform), "dedicated" (someone else's page made for the phrase), or null.
 */
export function serpRole(
  phrase: string,
  result: { url: string; title: string },
  category?: string | null,
): "official" | "dedicated" | null {
  const host = hostOf(result.url);
  const label = host.split(".").at(-2) ?? "";
  const name = compact(phrase);
  const first = compact(phrase.split(/\s+/)[0] ?? "");
  const ownSite =
    (name.length >= 4 && compact(label).includes(name)) ||
    (!!category &&
      NAMED.has(category) &&
      first.length >= 4 &&
      compact(label) === first);
  const slug = phrase.toLowerCase().split(/\s+/);
  const path = decodeURIComponent(result.url.toLowerCase()).replace(
    /[^a-z0-9]+/g,
    " ",
  );
  const madeFor =
    isDedicated(result.title, phrase) || slug.every((w) => path.includes(w));
  if (ownSite) return "official";
  if (!madeFor) return null;
  const platform = PLATFORM_HOSTS.some(
    (p) => host === p || host.endsWith(`.${p}`),
  );
  return platform ? "official" : "dedicated";
}

/** Pages in the results made for this phrase by someone else than its maker or a platform. */
export function dedicatedPages(
  phrase: string,
  results: { url: string; title: string }[],
  category?: string | null,
) {
  return results.filter((r) => serpRole(phrase, r, category) === "dedicated")
    .length;
}

/** The maker's pages and platform listings for this phrase: not counted as competition. */
export function officialPages(
  phrase: string,
  results: { url: string; title: string }[],
  category?: string | null,
) {
  return results.filter((r) => serpRole(phrase, r, category) === "official")
    .length;
}

/** Whether a new word is worth a page, and which kind. */
export function newWordVerdict(input: {
  phrase: string;
  ratio: number | null;
  /** Null when the word did not pass the screen: its results were not checked. */
  dedicated: number | null;
  /** Official and platform pages left out of `dedicated`. */
  official?: number;
  rising: boolean;
  isNew: boolean;
  spike?: boolean;
}): { verdict: Verdict; buildAs: BuildAs | null; reasons: VerdictReason[] } {
  const { ratio, dedicated, official, rising, isNew, spike } = input;
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
    ...(dedicated === null
      ? []
      : [
          {
            code:
              dedicated === 0
                ? ("no_dedicated" as const)
                : dedicated <= TRY_MAX_DEDICATED
                  ? ("few_dedicated" as const)
                  : ("many_dedicated" as const),
            value: dedicated,
          },
          ...(official ? [{ code: "official" as const, value: official }] : []),
        ]),
    {
      code: heat >= WORTH_RATIO ? "hot" : heat >= TRY_RATIO ? "warm" : "cold",
      value: Math.round(heat * 1000) / 1000,
    },
    { code: rising ? "rising" : "falling" },
    ...(isNew ? [{ code: "new_word" as const }] : []),
    ...(spike ? [{ code: "spike" as const }] : []),
  ];
  if (dedicated === null) return { verdict: "skip", buildAs: null, reasons };
  if (
    heat >= WORTH_RATIO &&
    dedicated <= WORTH_MAX_DEDICATED &&
    rising &&
    !spike
  )
    return { verdict: "worth", buildAs: "new_site", reasons };
  if (heat >= TRY_RATIO && dedicated <= TRY_MAX_DEDICATED && rising)
    return { verdict: "try", buildAs: "inner_page", reasons };
  return { verdict: "skip", buildAs: null, reasons };
}
