// Rules for new words (docs/product/keyword-pool.md#new-words), version newword-v1:
// how a just-rising query is measured and whether it is worth a page. The thresholds
// are first guesses, set from the maintainer's reference screens; calibrate them.
import type { TrendComparison } from "./keyword-provider";
import { autoExclude } from "./pool-rules";
import { isDedicated } from "./serp-competition";

// v2 (S68): heat is the last 7 days' average; a one-day spike is at most worth a try.
// v3 (S75): the maker's own page and platform listings are not competition.
// v4 (S76): a hot word already crowded is worth its long tails, not skipped.
export const NEW_WORD_RULES = "newword-v4";
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
export type BuildAs = "new_site" | "inner_page" | "long_tail";
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
    | "category"
    | "crowded"
    // S85, gates from the vet-keyword method (docs/product/keyword-pool.md#gates):
    | "window_closed"
    | "brands_no_new"
    | "old_exact_top5"
    | "clustered"
    // S95, five years on Google (new-word-history.ts):
    | "old_word"
    | "seasonal"
    | "pure_new";
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
  // A big name: too many pages for its own word, but its pricing, comparisons and
  // how-tos are new searches too.
  if (heat >= WORTH_RATIO && rising)
    return {
      verdict: "try",
      buildAs: "long_tail",
      reasons: [...reasons, { code: "crowded" }],
    };
  return { verdict: "skip", buildAs: null, reasons };
}

// --- Gates (S85): the automatic part of the vet-keyword method, so a word that would be
// stopped there is stopped here, and the rest arrive with their facts written down.

/** gpts's US monthly searches (Semrush, 2026-11): the yardstick that turns a ratio into searches. */
export const GPTS_US_MONTHLY = 5_400;
/** A new site needs this many US monthly searches (Gate 6, condition 2). */
export const NEW_SITE_MIN_MONTHLY = 5_000;
/** Down this much from the peak week: the hot word's window has closed (knockout 4). */
export const WINDOW_CLOSED_DROP = 0.5;
/** Top 30 domains under 24 months old from this many on: the word is crowded. */
export const CLUSTER_MIN = 5;
/** Big-brand pages on page one, with no new site there: knockout 1. */
export const BRANDS_KNOCKOUT = 3;
/** The vet-keyword list of big brands, SaaS and guide brands (serp-teardown.md). */
const BRANDS =
  /(^|\.)(canva|picsart|adobe|piccollage|creativefabrica|commoninja|fotor|kapwing|miro|capcut|dreamina|media\.io|pollo|game8|prydwen|icy-veins|mobalytics|wowhead|maxroll|gamefaqs)\./;
/** Results that take clicks away from page one (DataForSEO item types). */
export const CLICK_FEATURES = [
  "ai_overview",
  "video",
  "short_videos",
  "images",
  "people_also_ask",
  "featured_snippet",
  "answer_box",
] as const;
export type ClickFeature = (typeof CLICK_FEATURES)[number];
const EXACT_TLDS = ["com", "net", "org"] as const;

export type Gates = {
  /** Estimated US monthly searches: the ratio times gpts's. */
  monthly: number | null;
  /** How far the latest week is below the peak week (0 to 1); null without a curve. */
  peakDrop: number | null;
  top10New: number;
  top30Under12: number;
  top30Under24: number;
  /** Domains the registry did not answer for. */
  top30Unknown: number;
  clustered: boolean;
  brandsTop10: number;
  /** An exact-match domain in the top 5 registered more than 12 months ago. */
  oldExactTop5: string | null;
  features: ClickFeature[];
  /** The word's own .com, .net, .org: registered on a day, free, or unknown. */
  exactDomains: {
    domain: string;
    registeredOn: string | null;
    free: boolean;
  }[];
  knockouts: ("window_closed" | "brands_no_new" | "old_exact_top5")[];
};

/** The word as a domain label: letters and digits only ("goodbye gta 5" → goodbyegta5). */
export const exactLabel = (phrase: string) =>
  phrase.toLowerCase().replace(/[^a-z0-9]/g, "");

/** The domains to look up for a word's own exact match. */
export const exactDomainsOf = (phrase: string) =>
  exactLabel(phrase).length >= 3
    ? EXACT_TLDS.map((tld) => `${exactLabel(phrase)}.${tld}`)
    : [];

/** The latest week's peak below the highest week's peak, from a daily curve. */
export function peakDrop(days: { day: string; value: number }[]) {
  if (days.length < 14) return null;
  const weeks: number[] = [];
  for (let end = days.length; end > 0; end -= 7)
    weeks.unshift(
      Math.max(...days.slice(Math.max(0, end - 7), end).map((d) => d.value)),
    );
  const top = Math.max(...weeks);
  if (top <= 0) return null;
  return Math.max(0, 1 - weeks.at(-1)! / top);
}

/**
 * The gates for a checked word. `organic` is the top 30 in order; `ages` has the
 * registration day of each registrable domain (null: unknown, `free`: not registered).
 */
export function gateFacts(input: {
  phrase: string;
  ratio: number | null;
  days: { day: string; value: number }[];
  organic: { site: string }[];
  features: string[];
  ages: Map<string, { registeredOn: string | null; free?: boolean }>;
  registrable: (host: string) => string;
  today: string;
}): Gates {
  const monthsOld = (registeredOn: string | null) =>
    registeredOn
      ? (Date.parse(input.today) - Date.parse(registeredOn)) /
        (30.44 * 86_400_000)
      : null;
  const domains = input.organic.map((r) =>
    /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(r.site)
      ? input.registrable(r.site)
      : null,
  );
  const ageAt = (i: number) => {
    const d = domains[i];
    return d ? monthsOld(input.ages.get(d)?.registeredOn ?? null) : null;
  };
  const distinct = (from: number, to: number, test: (m: number) => boolean) => {
    const seen = new Set<string>();
    for (let i = from; i < Math.min(to, domains.length); i++) {
      const d = domains[i];
      const m = ageAt(i);
      if (d && m !== null && test(m)) seen.add(d);
    }
    return seen.size;
  };
  const top30 = new Set(domains.slice(0, 30).filter(Boolean) as string[]);
  const top30Unknown = [...top30].filter(
    (d) => !input.ages.get(d)?.registeredOn,
  ).length;
  const top10New = distinct(0, 10, (m) => m < 12);
  const top30Under12 = distinct(0, 30, (m) => m < 12);
  const top30Under24 = distinct(0, 30, (m) => m < 24);
  const brandsTop10 = new Set(
    domains
      .slice(0, 10)
      .filter((d): d is string => !!d && BRANDS.test(`${d}.`)),
  ).size;
  const label = exactLabel(input.phrase);
  let oldExactTop5: string | null = null;
  for (let i = 0; i < Math.min(5, domains.length); i++) {
    const d = domains[i];
    const m = ageAt(i);
    if (
      d &&
      label.length >= 3 &&
      d.split(".")[0] === label &&
      m !== null &&
      m >= 12
    )
      oldExactTop5 = d;
  }
  const drop = peakDrop(input.days);
  const knockouts: Gates["knockouts"] = [];
  if (drop !== null && drop >= WINDOW_CLOSED_DROP)
    knockouts.push("window_closed");
  if (brandsTop10 >= BRANDS_KNOCKOUT && top10New === 0)
    knockouts.push("brands_no_new");
  if (oldExactTop5 && top10New === 0) knockouts.push("old_exact_top5");
  return {
    monthly:
      input.ratio === null ? null : Math.round(input.ratio * GPTS_US_MONTHLY),
    peakDrop: drop === null ? null : Math.round(drop * 100) / 100,
    top10New,
    top30Under12,
    top30Under24,
    top30Unknown,
    clustered: top30Under24 >= CLUSTER_MIN,
    brandsTop10,
    oldExactTop5,
    features: input.features.filter((f): f is ClickFeature =>
      (CLICK_FEATURES as readonly string[]).includes(f),
    ),
    exactDomains: exactDomainsOf(input.phrase).map((domain) => {
      const a = input.ages.get(domain);
      return {
        domain,
        registeredOn: a?.registeredOn ?? null,
        free: !!a?.free,
      };
    }),
    knockouts,
  };
}

/**
 * The verdict after the gates: a knockout makes it a skip (vet-keyword would drop it);
 * a crowded top 30 is no new site, only an inner page.
 */
export function applyGates(
  v: { verdict: Verdict; buildAs: BuildAs | null; reasons: VerdictReason[] },
  gates: Gates,
): { verdict: Verdict; buildAs: BuildAs | null; reasons: VerdictReason[] } {
  if (v.verdict === "skip") return v;
  if (gates.knockouts.length)
    return {
      verdict: "skip",
      buildAs: null,
      reasons: [
        ...v.reasons,
        ...gates.knockouts.map((code) => ({
          code,
          ...(code === "window_closed" && gates.peakDrop !== null
            ? { value: Math.round(gates.peakDrop * 100) }
            : code === "brands_no_new"
              ? { value: gates.brandsTop10 }
              : {}),
        })),
      ],
    };
  if (gates.clustered && v.buildAs === "new_site")
    return {
      verdict: "try",
      buildAs: "inner_page",
      reasons: [...v.reasons, { code: "clustered", value: gates.top30Under24 }],
    };
  return v;
}
