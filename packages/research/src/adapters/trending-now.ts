// Google Trends "Trending Now" for the US (docs/product/keyword-pool.md#name-sources): the
// searches rising in the last few hours, through the google-trends-now client (Google's own
// page data, RSS as a fallback). Free. Sports, politics, law, entertainment and weather are
// dropped: news that does not need a website.
import {
  fetchTrendingNow,
  type TrendingNowItem,
  type TrendingNowOptions,
  type TrendingNowOutput,
} from "google-trends-now";

import type { NameItem, NameSource } from "./name-sources";

/** Trending Now categories that are news, not a need a tool or a page can meet. */
const NEWS_CATEGORIES = new Set([
  "Sports",
  "Politics",
  "Law and Government",
  "Entertainment",
  "Climate",
]);

/** The searches worth measuring: none of their categories is news. */
export function trendingPhrases(items: TrendingNowItem[]) {
  return items
    .filter(
      (i) =>
        i.categories.length === 0 ||
        !i.categories.some((c) => NEWS_CATEGORIES.has(c.name)),
    )
    .map((i) => i.query.toLowerCase().trim())
    .filter((q) => q.length > 1);
}

/** Searches a trend needs for each heat: 100K+ is 3, 20K+ is 2. */
const volumeHeat = (volume: number | string | null): 1 | 2 | 3 => {
  const n = typeof volume === "number" ? volume : Number(volume) || 0;
  return n >= 100_000 ? 3 : n >= 20_000 ? 2 : 1;
};

/** The trends worth measuring, rated by their search volume and dated from their start. */
export function trendingNames(items: TrendingNowItem[]): NameItem[] {
  const seen = new Set<string>();
  return items
    .filter(
      (i) =>
        i.categories.length === 0 ||
        !i.categories.some((c) => NEWS_CATEGORIES.has(c.name)),
    )
    .flatMap((i) => {
      const name = i.query.toLowerCase().trim();
      if (name.length <= 1 || seen.has(name)) return [];
      seen.add(name);
      return [
        {
          name,
          heat: volumeHeat(i.search_volume),
          releasedAt: i.started_at,
        },
      ];
    });
}

/** Google's category id for Technology in Trending Now. */
const TECHNOLOGY = 18;
/** Other English-speaking countries: only their technology trends (S76). */
const TECH_GEOS = ["GB", "CA", "AU", "IN"];

/**
 * All US trends but news, and the technology trends of four more countries (S76): a new
 * product often trends there too, or first. A country that fails is skipped.
 */
export function createTrendingNow(
  deps: {
    fetchImpl?: typeof fetch;
    /** Replaces the client, for tests. */
    fetchTrends?: (options: TrendingNowOptions) => Promise<TrendingNowOutput>;
    /** Hours of trends to read; a scan every 3 hours reads the last 4. */
    hours?: 4 | 24 | 48 | 168;
  } = {},
): NameSource {
  const fetchTrends = deps.fetchTrends ?? fetchTrendingNow;
  const read = async (geo: string, category?: number) => {
    const out = await fetchTrends({
      geo,
      ...(category !== undefined && { category }),
      hours: deps.hours ?? 4,
      limit: "all",
      retries: 1,
      timeoutMs: 20_000,
      ...(deps.fetchImpl && { fetchImpl: deps.fetchImpl }),
    });
    if (out.fetch_status === "manual_review_required")
      throw new Error(`Trending Now ${geo}: ${out.error ?? "unavailable"}`);
    return out.items;
  };
  return {
    name: "trending_now",
    async names(limit) {
      // The US first: a failure there fails the source.
      const items = [...(await read("US"))];
      for (const geo of TECH_GEOS)
        items.push(...(await read(geo, TECHNOLOGY).catch(() => [])));
      return trendingNames(items)
        .toSorted((a, b) => b.heat - a.heat)
        .slice(0, limit);
    },
  };
}
