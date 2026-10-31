import { z } from "zod";

import { ProviderAuthError } from "@repo/ai/provider-errors";

import type {
  Charged,
  KeywordIdea,
  KeywordProvider,
  Market,
  RankedKeyword,
  RisingQuery,
  SerpItem,
  TrendComparison,
  TrendPoint,
  VolumeBand,
} from "../keyword-provider";

const AUTH_FAILED = 40100;

// DataForSEO v3 (https://docs.dataforseo.com/v3/): HTTP Basic auth, one task per Live
// call, and every response reports what it cost in USD. Status 20000 is success, at the
// top level and per task.
export const DATAFORSEO_API = "https://api.dataforseo.com/v3";

// Most one call can cost, in micro-USD, reserved before it. Above the prices on
// dataforseo.com/pricing (checked 2026-10-10): Google Ads Live $0.09 per task; SERP Live
// $0.002 per 10 results, 5× for operators such as site:; Labs $0.012 per task + $0.00012
// per keyword. The ledger settles on the cost each response reports.
// Labs calls of up to 1000 keywords: $0.012 + 1000 × $0.00012 = $0.132 (seen 2026-10-31).
// Google Trends explore: $0.011 per term (seen 2026-10-31).
export const DATAFORSEO_MAX_COST = {
  expand: 100_000,
  serp: 10_000,
  difficulty: 50_000,
  suggestions: 200_000,
  ranked: 200_000,
  traffic: 50_000,
  trend: 20_000,
  compare: 20_000,
  rising: 20_000,
} as const;
/** Most keywords one Labs call returns: the reservation above covers this many. */
export const LABS_MAX_LIMIT = 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
// Google Ads volumes are monthly figures and KD moves slowly: reuse for 30 days. Search
// results change faster: 7 days.
// Labs keyword data and site traffic are monthly figures too; the Trends curve gains a
// point a week.
export const DATAFORSEO_CACHE_TTL_MS = {
  expand: 30 * DAY_MS,
  difficulty: 30 * DAY_MS,
  serp: 7 * DAY_MS,
  suggestions: 30 * DAY_MS,
  ranked: 30 * DAY_MS,
  traffic: 30 * DAY_MS,
  trend: 7 * DAY_MS,
  // New words move by the hour: a comparison or rising list is reused for a few hours.
  compare: 6 * 60 * 60 * 1000,
  rising: 6 * 60 * 60 * 1000,
} as const;
/** Keywords per bulk difficulty call; the API takes up to 1000. */
export const DIFFICULTY_BATCH = 200;
/** Google Ads Live endpoints take 12 requests a minute per account. */
export const GOOGLE_ADS_INTERVAL_MS = 5_000;

const task = <T extends z.ZodType>(result: T) =>
  z.object({
    status_code: z.number(),
    cost: z.number().nullish(),
    tasks: z
      .array(
        z.object({
          status_code: z.number(),
          cost: z.number().nullish(),
          result: z.array(result).nullish(),
        }),
      )
      .nullish(),
  });

const googleAdsItem = z.object({
  keyword: z.string(),
  search_volume: z.number().int().nullish(),
  competition_index: z.number().int().nullish(),
  cpc: z.number().nullish(),
});

const difficultyResult = z.object({
  items: z
    .array(
      z.object({
        keyword: z.string(),
        keyword_difficulty: z.number().int().nullish(),
      }),
    )
    .nullish(),
});

const serpResult = z.object({
  items: z
    .array(
      z.looseObject({
        type: z.string(),
        rank_group: z.number().int().nullish(),
        title: z.string().nullish(),
        url: z.string().nullish(),
        breadcrumb: z.string().nullish(),
        website_name: z.string().nullish(),
      }),
    )
    .nullish(),
});

const host = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
};

/**
 * Google wraps many organic results in a google.com/goto redirect, and DataForSEO then
 * reports url and domain as google.com. The breadcrumb still starts with the real
 * address ("https://example.com › tools › x"); for some results (Reddit threads) it is
 * only "9 comments", and the website name is the only clue. A home page gets its own
 * address back. An inner page keeps the redirect, because the breadcrumb shortens the path.
 */
export function realSite(item: {
  url: string;
  breadcrumb?: string | null;
  website_name?: string | null;
}): { url: string; site: string } {
  const own = host(item.url);
  if (!/^https?:\/\/(www\.)?google\.com\/goto\b/.test(item.url))
    return { url: item.url, site: own ?? item.url };
  const crumb = item.breadcrumb?.trim() ?? "";
  if (/^https?:\/\//.test(crumb)) {
    const address = crumb.split("›")[0].trim();
    const site = host(address);
    if (site) return { url: crumb.includes("›") ? item.url : address, site };
  }
  const name = item.website_name?.split("·")[0].trim();
  return { url: item.url, site: name || (own ?? item.url) };
}

// A Labs keyword (keyword_suggestions, ranked_keywords): Google Ads data plus
// difficulty. Labs competition is 0 to 1; the port's adsCompetition is 0 to 100.
const labsKeyword = z.object({
  keyword: z.string(),
  keyword_info: z
    .object({
      search_volume: z.number().int().nullish(),
      cpc: z.number().nullish(),
      competition: z.number().nullish(),
      monthly_searches: z
        .array(
          z.object({
            year: z.number().int(),
            month: z.number().int(),
            search_volume: z.number().int().nullish(),
          }),
        )
        .nullish(),
    })
    .nullish(),
  keyword_properties: z
    .object({ keyword_difficulty: z.number().int().nullish() })
    .nullish(),
});

const suggestionsResult = z.object({
  seed_keyword: z.string().nullish(),
  seed_keyword_data: labsKeyword.omit({ keyword: true }).nullish(),
  items: z.array(labsKeyword).nullish(),
});

const rankedResult = z.object({
  items: z
    .array(
      z.object({
        keyword_data: labsKeyword,
        ranked_serp_element: z.object({
          serp_item: z.looseObject({
            rank_group: z.number().int(),
            url: z.string(),
          }),
        }),
      }),
    )
    .nullish(),
});

const trafficResult = z.object({
  items: z
    .array(
      z.object({
        target: z.string(),
        metrics: z
          .object({
            organic: z.object({ etv: z.number().nullish() }).nullish(),
          })
          .nullish(),
      }),
    )
    .nullish(),
});

const exploreResult = z.object({
  items: z
    .array(z.looseObject({ type: z.string(), data: z.unknown() }))
    .nullish(),
});
const comparePoints = z.array(
  z.object({
    date_from: z.string(),
    timestamp: z.number().nullish(),
    missing_data: z.boolean().nullish(),
    values: z.array(z.number().nullable()),
  }),
);
const queriesList = z.object({
  rising: z
    .array(z.object({ query: z.string(), value: z.number().nullish() }))
    .nullish(),
});

const trendResult = z.object({
  items: z
    .array(
      z.looseObject({
        type: z.string(),
        data: z
          .array(
            z.object({
              date_from: z.string(),
              missing_data: z.boolean().nullish(),
              values: z.array(z.number().nullable()).nullish(),
            }),
          )
          .nullish(),
      }),
    )
    .nullish(),
});

function labsIdea(item: z.output<typeof labsKeyword>): KeywordIdea {
  const info = item.keyword_info;
  const months = [...(info?.monthly_searches ?? [])]
    .sort((a, b) => a.year - b.year || a.month - b.month)
    .slice(-12)
    .map((m) => m.search_volume ?? 0);
  return {
    phrase: item.keyword,
    metrics: {
      searchVolume: info?.search_volume ?? null,
      cpcMicros: info?.cpc == null ? null : micros(info.cpc),
      adsCompetition:
        info?.competition == null ? null : Math.round(info.competition * 100),
      keywordDifficulty: item.keyword_properties?.keyword_difficulty ?? null,
    },
    ...(months.length > 0 && { monthlySearches: months }),
  };
}

const volumeFilter = (field: string, band: VolumeBand) =>
  band.maxVolume === undefined
    ? [field, ">=", band.minVolume]
    : [[field, ">=", band.minVolume], "and", [field, "<=", band.maxVolume]];

const inBand = (volume: number | null, band: VolumeBand) =>
  volume !== null &&
  volume >= band.minVolume &&
  (band.maxVolume === undefined || volume <= band.maxVolume);

const micros = (usd: number | null | undefined) =>
  Math.round((usd ?? 0) * 1_000_000);

export function createDataForSeoProvider(deps: {
  login: string;
  password: string;
  fetch?: typeof fetch;
  baseUrl?: string;
  timeoutMs?: number;
  /** Waits between Google Ads calls; tests pass a no-op. */
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}): KeywordProvider {
  const fetcher = deps.fetch ?? globalThis.fetch;
  const baseUrl = deps.baseUrl ?? DATAFORSEO_API;
  const sleep =
    deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const now = deps.now ?? Date.now;
  const auth = `Basic ${btoa(`${deps.login}:${deps.password}`)}`;
  // The next time a Google Ads call may start; shared by the calls of this process.
  let googleAdsFrom = 0;

  async function post<T extends z.ZodType>(
    path: string,
    body: Record<string, unknown>,
    result: T,
  ): Promise<Charged<z.output<T>[]>> {
    const response = await fetcher(`${baseUrl}/${path}`, {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify([body]),
      signal: AbortSignal.timeout(deps.timeoutMs ?? 60_000),
    });
    // The error never holds the credentials or the response body.
    if (response.status === 401)
      throw new ProviderAuthError(`DataForSEO ${path} returned 401`);
    if (!response.ok)
      throw new Error(`DataForSEO ${path} returned ${response.status}`);
    const parsed = task(result).parse(await response.json());
    // 40100: the login or password was refused (seen in the S33 run).
    if (parsed.status_code === AUTH_FAILED)
      throw new ProviderAuthError(`DataForSEO ${path} failed: ${AUTH_FAILED}`);
    if (parsed.status_code !== 20000)
      throw new Error(`DataForSEO ${path} failed: ${parsed.status_code}`);
    const first = parsed.tasks?.[0];
    if (!first) throw new Error(`DataForSEO ${path} returned no task`);
    if (first.status_code !== 20000)
      throw new Error(`DataForSEO ${path} task failed: ${first.status_code}`);
    return {
      value: first.result ?? [],
      costMicros: micros(first.cost ?? parsed.cost),
    };
  }

  async function googleAdsTurn() {
    const wait = googleAdsFrom - now();
    googleAdsFrom = Math.max(googleAdsFrom, now()) + GOOGLE_ADS_INTERVAL_MS;
    if (wait > 0) await sleep(wait);
  }

  const location = (market: Market) => ({
    location_code: market.locationCode,
    language_code: market.languageCode,
  });

  return {
    name: "dataforseo",
    maxCostMicros: DATAFORSEO_MAX_COST,
    cacheTtlMs: DATAFORSEO_CACHE_TTL_MS,
    async expand(seed, market) {
      await googleAdsTurn();
      const charged = await post(
        "keywords_data/google_ads/keywords_for_keywords/live",
        { keywords: [seed], ...location(market), sort_by: "relevance" },
        googleAdsItem,
      );
      return {
        costMicros: charged.costMicros,
        value: charged.value.map((item): KeywordIdea => ({
          phrase: item.keyword,
          metrics: {
            searchVolume: item.search_volume ?? null,
            cpcMicros: item.cpc == null ? null : micros(item.cpc),
            adsCompetition: item.competition_index ?? null,
            // Google Ads has no SEO difficulty; difficulty() adds it.
            keywordDifficulty: null,
          },
        })),
      };
    },
    async difficulty(phrases, market) {
      const charged = await post(
        "dataforseo_labs/google/bulk_keyword_difficulty/live",
        { keywords: phrases.slice(0, DIFFICULTY_BATCH), ...location(market) },
        difficultyResult,
      );
      const value = new Map<string, number>();
      for (const result of charged.value)
        for (const item of result.items ?? [])
          if (item.keyword_difficulty != null)
            value.set(item.keyword, item.keyword_difficulty);
      return { value, costMicros: charged.costMicros };
    },
    async serp(phrase, market, depth = 10) {
      const charged = await post(
        "serp/google/organic/live/advanced",
        { keyword: phrase, ...location(market), device: "desktop", depth },
        serpResult,
      );
      const items: SerpItem[] = [];
      for (const result of charged.value)
        for (const item of result.items ?? [])
          if (item.type === "organic" && item.url && item.rank_group)
            items.push({
              rank: item.rank_group,
              ...realSite({ ...item, url: item.url }),
              title: item.title ?? "",
              type: item.type,
            });
      return {
        value: items.sort((a, b) => a.rank - b.rank).slice(0, depth),
        costMicros: charged.costMicros,
      };
    },
    async suggestions(seed, market, band) {
      const charged = await post(
        "dataforseo_labs/google/keyword_suggestions/live",
        {
          keyword: seed,
          ...location(market),
          include_seed_keyword: true,
          limit: Math.min(band.limit, LABS_MAX_LIMIT),
          filters: volumeFilter("keyword_info.search_volume", band),
          order_by: ["keyword_info.search_volume,desc"],
        },
        suggestionsResult,
      );
      const value: KeywordIdea[] = [];
      for (const result of charged.value) {
        // The seed comes apart from the items and is not filtered by the band.
        if (result.seed_keyword && result.seed_keyword_data) {
          const idea = labsIdea({
            keyword: result.seed_keyword,
            ...result.seed_keyword_data,
          });
          if (inBand(idea.metrics.searchVolume, band)) value.push(idea);
        }
        for (const item of result.items ?? []) value.push(labsIdea(item));
      }
      return { value, costMicros: charged.costMicros };
    },
    async rankedKeywords(site, market, band) {
      const charged = await post(
        "dataforseo_labs/google/ranked_keywords/live",
        {
          target: site,
          ...location(market),
          limit: Math.min(band.limit, LABS_MAX_LIMIT),
          filters: volumeFilter(
            "keyword_data.keyword_info.search_volume",
            band,
          ),
          order_by: ["keyword_data.keyword_info.search_volume,desc"],
        },
        rankedResult,
      );
      const value: RankedKeyword[] = charged.value.flatMap((result) =>
        (result.items ?? []).map((item) => ({
          ...labsIdea(item.keyword_data),
          rank: item.ranked_serp_element.serp_item.rank_group,
          url: item.ranked_serp_element.serp_item.url,
        })),
      );
      return { value, costMicros: charged.costMicros };
    },
    async siteTraffic(sites, market) {
      const charged = await post(
        "dataforseo_labs/google/bulk_traffic_estimation/live",
        { targets: sites, ...location(market), item_types: ["organic"] },
        trafficResult,
      );
      const value = new Map<string, number>();
      for (const result of charged.value)
        for (const item of result.items ?? []) {
          const etv = item.metrics?.organic?.etv;
          if (etv != null) value.set(item.target, etv);
        }
      return { value, costMicros: charged.costMicros };
    },
    async trendCompare(phrases, market, range) {
      const charged = await post(
        "keywords_data/google_trends/explore/live",
        {
          keywords: phrases.slice(0, 5),
          location_code: market.locationCode,
          time_range: range,
          type: "web",
        },
        exploreResult,
      );
      const value: TrendComparison = [];
      for (const result of charged.value)
        for (const item of result.items ?? []) {
          if (item.type !== "google_trends_graph") continue;
          for (const p of comparePoints.parse(item.data ?? [])) {
            // The current hour or day is partial and marked missing. A null value is
            // "less than 1": counted as 0.
            if (p.missing_data) continue;
            value.push({
              at: p.timestamp
                ? new Date(p.timestamp * 1000).toISOString()
                : p.date_from,
              values: p.values.map((v) => v ?? 0),
            });
          }
        }
      return { value, costMicros: charged.costMicros };
    },
    async risingQueries(root, market) {
      const charged = await post(
        "keywords_data/google_trends/explore/live",
        {
          keywords: [root],
          location_code: market.locationCode,
          time_range: "past_7_days",
          type: "web",
          item_types: ["google_trends_queries_list"],
        },
        exploreResult,
      );
      const value: RisingQuery[] = [];
      for (const result of charged.value)
        for (const item of result.items ?? [])
          if (item.type === "google_trends_queries_list")
            for (const q of queriesList.parse(item.data ?? {}).rising ?? [])
              value.push({ query: q.query, value: q.value ?? 0 });
      return { value, costMicros: charged.costMicros };
    },
    async searchTrend(phrase, market) {
      const charged = await post(
        "keywords_data/google_trends/explore/live",
        {
          keywords: [phrase],
          location_code: market.locationCode,
          time_range: "past_5_years",
          type: "web",
        },
        trendResult,
      );
      const value: TrendPoint[] = [];
      for (const result of charged.value)
        for (const item of result.items ?? [])
          if (item.type === "google_trends_graph")
            for (const point of item.data ?? []) {
              const v = point.values?.[0];
              // The current week is partial and marked missing.
              if (!point.missing_data && v != null)
                value.push({ week: point.date_from, value: v });
            }
      return { value, costMicros: charged.costMicros };
    },
  };
}
