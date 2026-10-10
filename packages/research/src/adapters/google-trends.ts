import { XMLParser } from "fast-xml-parser";
import { z } from "zod";

// Google Trends "Trending Now" as RSS: one of the export options the Trends help page
// lists (support.google.com/trends/answer/3076011), public, no key; robots.txt does not
// disallow it. It has no documented schema: the fields below are the ones the feed
// sends, checked on 2026-10-10, and a change makes the parse fail loudly.
export const GOOGLE_TRENDS_RSS = "https://trends.google.com/trending/rss";
export const GOOGLE_TRENDS_PAGE = "https://trends.google.com/trending";
/** The radar's market: United States, like the default research market. */
export const GOOGLE_TRENDS_GEO = "US";

const text = z.union([z.string(), z.number()]).transform(String);
const feedSchema = z.object({
  rss: z.object({
    // An empty <channel/> parses as "": no items.
    channel: z.preprocess(
      (v) => (v === "" ? {} : v),
      z.object({
        item: z
          .array(
            z.object({
              title: text,
              approx_traffic: text.optional(),
              pubDate: text.optional(),
              news_item: z
                .array(z.object({ news_item_url: text.optional() }))
                .optional(),
            }),
          )
          .optional(),
      }),
    ),
  }),
});

export type TrendingSearch = {
  term: string;
  /** Google's approximate searches, a lower bound ("500+" is 500); null when absent. */
  approxTraffic: number | null;
  publishedAt: Date | null;
  /** The first news story Google links to the search. */
  newsUrl: string | null;
};

export interface GoogleTrendsSource {
  trending(geo: string): Promise<TrendingSearch[]>;
}

/** "500+" → 500, "1,000+" → 1000, "2K+" → 2000; anything else is null. */
export function parseApproxTraffic(label: string | undefined) {
  const match = label?.trim().match(/^([\d,.]+)\s*([KkMm]?)\+?$/);
  if (!match) return null;
  const value = Number(match[1].replace(/,/g, ""));
  if (!Number.isFinite(value)) return null;
  const scale = { k: 1_000, m: 1_000_000 }[match[2].toLowerCase()] ?? 1;
  return Math.round(value * scale);
}

const parser = new XMLParser({
  ignoreAttributes: true,
  removeNSPrefix: true,
  parseTagValue: false,
  isArray: (name) => name === "item" || name === "news_item",
});

export function parseTrendingFeed(xml: string): TrendingSearch[] {
  const feed = feedSchema.parse(parser.parse(xml));
  return (feed.rss.channel.item ?? []).map((item) => {
    const published = item.pubDate ? new Date(item.pubDate) : null;
    return {
      term: item.title,
      approxTraffic: parseApproxTraffic(item.approx_traffic),
      publishedAt:
        published && !Number.isNaN(published.getTime()) ? published : null,
      newsUrl: item.news_item?.[0]?.news_item_url ?? null,
    };
  });
}

export function createGoogleTrendsClient(
  deps: { fetch?: typeof fetch; timeoutMs?: number } = {},
): GoogleTrendsSource {
  const fetcher = deps.fetch ?? globalThis.fetch;
  return {
    async trending(geo) {
      const response = await fetcher(
        `${GOOGLE_TRENDS_RSS}?geo=${encodeURIComponent(geo)}`,
        { signal: AbortSignal.timeout(deps.timeoutMs ?? 10_000) },
      );
      if (!response.ok)
        throw new Error(`Google Trends RSS returned ${response.status}`);
      return parseTrendingFeed(await response.text());
    },
  };
}
