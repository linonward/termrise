import { z } from "zod";

import type {
  Charged,
  KeywordIdea,
  KeywordProvider,
  Market,
  SerpItem,
} from "../keyword-provider";

// DataForSEO v3 (https://docs.dataforseo.com/v3/): HTTP Basic auth, one task per Live
// call, and every response reports what it cost in USD. Status 20000 is success, at the
// top level and per task.
export const DATAFORSEO_API = "https://api.dataforseo.com/v3";

// Most one call can cost, in micro-USD, reserved before it. Above the prices on
// dataforseo.com/pricing (checked 2026-10-10): Google Ads Live $0.09 per task; SERP Live
// $0.002 per 10 results, 5× for operators such as site:; Labs $0.012 per task + $0.00012
// per keyword. The ledger settles on the cost each response reports.
export const DATAFORSEO_MAX_COST = {
  expand: 100_000,
  serp: 10_000,
  difficulty: 50_000,
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
      }),
    )
    .nullish(),
});

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
    if (!response.ok)
      throw new Error(`DataForSEO ${path} returned ${response.status}`);
    const parsed = task(result).parse(await response.json());
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
    async serp(phrase, market) {
      const charged = await post(
        "serp/google/organic/live/advanced",
        { keyword: phrase, ...location(market), device: "desktop", depth: 10 },
        serpResult,
      );
      const items: SerpItem[] = [];
      for (const result of charged.value)
        for (const item of result.items ?? [])
          if (item.type === "organic" && item.url && item.rank_group)
            items.push({
              rank: item.rank_group,
              url: item.url,
              title: item.title ?? "",
              type: item.type,
            });
      return {
        value: items.sort((a, b) => a.rank - b.rank).slice(0, 10),
        costMicros: charged.costMicros,
      };
    },
  };
}
