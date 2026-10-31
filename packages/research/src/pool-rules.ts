// The tool-site rules (docs/product/keyword-pool.md#rules): hard limits a main keyword for
// a new tool site must pass. Ported from keyword-lab's SOP, where they were tested in two
// rounds of real data (2026-10-04, 2026-10-31). v2 (S72): a suffix keyword must end with
// its suffix, and a top 10 without a single tool page is not a tool search.
import type { KeywordIdea } from "./keyword-provider";
import { isDedicated, isHomepage } from "./serp-competition";

export const TOOL_SITE_RULES = "tool-site-v2";
/** H1: monthly searches in the US. */
export const MIN_VOLUME = 5000;
/** H2: SEO keyword difficulty. */
export const MAX_KD = 29;
/** H3: cost per click, in micro-USD ($0.10). */
export const MIN_CPC_MICROS = 100_000;
/** H6 ①: highest month over lowest month in the last 12. */
export const MAX_TREND_RATIO = 3;
/** H5: at most this many strong competitors in the top 10. */
export const MAX_STRONG = 3;
/** H5: a site with this many estimated monthly organic visits is big. */
export const STRONG_SITE_TRAFFIC = 50_000;
/** S1: a phrasing counts as a variant with this many monthly searches. */
export const MIN_VARIANT_VOLUME = 50;
/** Checked first: above it, head terms are mostly brands and queries AI answers. */
export const MID_BAND = { minVolume: 5000, maxVolume: 30_000 } as const;

export type Reason = {
  rule:
    | "H1"
    | "H2"
    | "H3"
    | "H4"
    | "H5"
    | "H6"
    | "H7"
    | "exclude"
    | "variants"
    /** S72: the top 10 has no tool page: people may want to buy, read or look. */
    | "intent"
    /** keyword-lab's own words, kept as they were (pool-import.ts). */
    | "imported";
  result: "fail" | "unsure" | "note";
  value?: number | string | null;
  limit?: number;
};

export type ScreenStatus = "pass" | "unsure" | "excluded" | "failed";

export type ScreenedKeyword = {
  phrase: string;
  status: ScreenStatus;
  reasons: Reason[];
  metrics: KeywordIdea["metrics"];
  monthlySearches: number[];
  /** Highest month over lowest of the last 12; null without monthly data. */
  ratio: number | null;
  midBand: boolean;
  /** Other phrasings with the same data, grouped into this one. */
  variants: string[];
  /** KD across the group when it differs, [lowest, highest]. */
  kdRange: [number, number] | null;
};

// The cases a pattern can catch; brands and people still need the maintainer's eye.
const AUTO_EXCLUDE: [RegExp, string][] = [
  [
    /\bnear me\b|\b(installation|repair|replacement|service|services|jobs?|hiring|salary)\b/,
    "offline",
  ],
  [/\b(for sale|buy|price|prices|cost|costs|cheap|best)\b/, "shopping"],
  [
    /\b(youtube|tiktok|instagram|spotify|netflix)\b.*\b(to mp3|to mp4|download|downloader|converter)\b|\b(to mp3|mp3 converter|video downloader)\b/,
    "downloads",
  ],
];

/** Why a keyword is plainly not a web tool: offline, shopping or downloads; else null. */
export function autoExclude(phrase: string) {
  const p = phrase.toLowerCase();
  return AUTO_EXCLUDE.find(([pattern]) => pattern.test(p))?.[1] ?? null;
}

export function trendRatio(months: number[]) {
  if (months.length < 2) return null;
  const low = Math.min(...months);
  const high = Math.max(...months);
  if (low <= 0) return high > 0 ? Infinity : null;
  return Math.round((high / low) * 100) / 100;
}

function screenOne(idea: KeywordIdea): ScreenedKeyword {
  const {
    searchVolume: volume,
    keywordDifficulty: kd,
    cpcMicros,
  } = idea.metrics;
  const months = idea.monthlySearches ?? [];
  const ratio = trendRatio(months);
  const fails: Reason[] = [];
  const unsure: Reason[] = [];
  if (volume === null || volume < MIN_VOLUME)
    fails.push({
      rule: "H1",
      result: "fail",
      value: volume,
      limit: MIN_VOLUME,
    });
  if (kd === null) unsure.push({ rule: "H2", result: "unsure", value: null });
  else if (kd > MAX_KD)
    fails.push({ rule: "H2", result: "fail", value: kd, limit: MAX_KD });
  if (cpcMicros === null)
    unsure.push({ rule: "H3", result: "unsure", value: null });
  else if (cpcMicros < MIN_CPC_MICROS)
    fails.push({
      rule: "H3",
      result: "fail",
      value: cpcMicros,
      limit: MIN_CPC_MICROS,
    });
  if (ratio !== null && ratio >= MAX_TREND_RATIO)
    fails.push({
      rule: "H6",
      result: "fail",
      value: ratio,
      limit: MAX_TREND_RATIO,
    });
  let status: ScreenStatus =
    fails.length > 0
      ? "failed"
      : unsure.some((r) => r.rule === "H3")
        ? "unsure"
        : "pass";
  let reasons = fails.length > 0 ? fails : unsure;
  const excluded = status === "failed" ? null : autoExclude(idea.phrase);
  if (excluded) {
    status = "excluded";
    reasons = [{ rule: "exclude", result: "fail", value: excluded }];
  }
  return {
    phrase: idea.phrase,
    status,
    reasons,
    metrics: idea.metrics,
    monthlySearches: months,
    ratio,
    midBand:
      volume !== null &&
      volume >= MID_BAND.minVolume &&
      volume <= MID_BAND.maxVolume,
    variants: [],
    kdRange: null,
  };
}

/**
 * Phrasings with the same volume, CPC and trend are one demand (DataForSEO shares them
 * across a group; only KD differs). Each group keeps its natural phrasing (ending with
 * the seed), else the shortest, and names the rest. Different statuses stay apart.
 */
export function groupVariants(rows: ScreenedKeyword[], seed = "") {
  const suffix = seed.toLowerCase();
  const natural = (p: string) =>
    suffix && p.toLowerCase().endsWith(` ${suffix}`) ? 0 : 1;
  const groups = new Map<string, ScreenedKeyword[]>();
  for (const r of rows) {
    const key =
      r.metrics.searchVolume === null
        ? `#${groups.size}`
        : [r.metrics.searchVolume, r.metrics.cpcMicros, r.ratio, r.status].join(
            "|",
          );
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  return [...groups.values()].map((members) => {
    if (members.length === 1) return members[0];
    const [keep, ...rest] = [...members].sort(
      (a, b) =>
        natural(a.phrase) - natural(b.phrase) ||
        a.phrase.length - b.phrase.length ||
        a.phrase.localeCompare(b.phrase),
    );
    const kds = members
      .map((r) => r.metrics.keywordDifficulty)
      .filter((k): k is number => k !== null);
    const low = Math.min(...kds);
    const high = Math.max(...kds);
    return {
      ...keep,
      variants: rest.map((r) => r.phrase).sort(),
      kdRange:
        kds.length > 1 && low !== high
          ? ([low, high] as [number, number])
          : null,
    };
  });
}

const ORDER: Record<ScreenStatus, number> = {
  pass: 0,
  unsure: 1,
  excluded: 2,
  failed: 3,
};

/**
 * Screens ideas with the limits their data can answer (H1, H2, H3, H6 ①), excludes
 * plain non-tools, groups phrasings, and orders them as they are checked: passing
 * first, mid-band before head terms, then by volume.
 */
/**
 * Whether a phrase ends with its suffix ("grammar checker", "unit calculators"): the tool
 * word comes last in English. In "checker board" the checker is a game, not a tool.
 */
export function endsWithSuffix(phrase: string, suffix: string) {
  const p = phrase.toLowerCase().trim();
  const s = suffix.toLowerCase().trim();
  return p === s || p.endsWith(` ${s}`) || p.endsWith(` ${s}s`);
}

export function screenKeywords(ideas: KeywordIdea[], seed = "") {
  const rows = ideas
    .map(screenOne)
    .sort(
      (a, b) =>
        ORDER[a.status] - ORDER[b.status] ||
        Number(b.midBand) - Number(a.midBand) ||
        (b.metrics.searchVolume ?? 0) - (a.metrics.searchVolume ?? 0),
    );
  // After grouping, so a group keeps its natural phrasing when it has one. A keyword that
  // already failed keeps its own reason.
  return groupVariants(rows, seed).map((r) =>
    seed &&
    (r.status === "pass" || r.status === "unsure") &&
    !endsWithSuffix(r.phrase, seed)
      ? {
          ...r,
          status: "excluded" as const,
          reasons: [
            {
              rule: "exclude" as const,
              result: "unsure" as const,
              value: "not_suffix",
            },
            ...r.reasons,
          ],
        }
      : r,
  );
}

/** Pages the page check read: at least this many before a missing tool page counts. */
export const INTENT_MIN_READ = 3;

/**
 * The intent check: the top 10 pages that could be read hold no tool. Null when too few
 * were read to say.
 */
export function noToolPage(pages: { access?: string; kind: string | null }[]) {
  const read = pages.filter((p) => p.kind !== null);
  if (read.length < INTENT_MIN_READ) return null;
  return !read.some((p) => p.kind === "tool");
}

/**
 * H5 and S3 from the top 10: a strong competitor is a big site (estimated organic
 * visits at least STRONG_SITE_TRAFFIC) with a page made for the keyword.
 */
export function strongCompetitors(
  phrase: string,
  results: { site: string | null; url: string; title: string }[],
  traffic: Map<string, number>,
  /** The page check's reading by result index; the title rule stands in without it. */
  madeFor?: Map<number, boolean>,
) {
  const top = results.slice(0, 10);
  const strongSites = top
    .filter(
      (r, i) =>
        r.site !== null &&
        (traffic.get(r.site) ?? 0) >= STRONG_SITE_TRAFFIC &&
        (madeFor?.get(i) ?? isDedicated(r.title, phrase)),
    )
    .map((r) => r.site as string);
  return {
    strong: strongSites.length,
    innerPages: top.filter((r) => !isHomepage(r.url)).length,
    strongSites,
  };
}
