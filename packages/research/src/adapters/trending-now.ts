// Google Trends "Trending Now" for the US (docs/product/keyword-pool.md#name-sources): the
// searches rising in the last few hours, through the google-trends-now client (Google's own
// page data, RSS as a fallback). Free. Sports, politics, law, entertainment and weather are
// dropped: news that does not need a website.
import {
  fetchTrendingNow,
  type TrendingNowItem,
  type TrendingNowOptions,
} from "google-trends-now";

import type { NameSource } from "./name-sources";

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

export function createTrendingNow(
  deps: {
    fetchImpl?: typeof fetch;
    /** Hours of trends to read; a scan every 3 hours reads the last 4. */
    hours?: 4 | 24 | 48 | 168;
  } = {},
): NameSource {
  return {
    name: "trending_now",
    async names(limit) {
      const options: TrendingNowOptions = {
        geo: "US",
        hours: deps.hours ?? 4,
        limit: "all",
        retries: 1,
        timeoutMs: 20_000,
        ...(deps.fetchImpl && { fetchImpl: deps.fetchImpl }),
      };
      const out = await fetchTrendingNow(options);
      if (out.fetch_status === "manual_review_required")
        throw new Error(`Trending Now: ${out.error ?? "unavailable"}`);
      return [...new Set(trendingPhrases(out.items))].slice(0, limit);
    },
  };
}
