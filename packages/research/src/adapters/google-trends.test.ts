import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, it } from "vitest";

import {
  createGoogleTrendsClient,
  GOOGLE_TRENDS_RSS,
  parseApproxTraffic,
  parseTrendingFeed,
} from "./google-trends";

// A real feed saved on 2026-10-10: the parser is checked against what Google sends.
const feed = readFileSync(
  join(import.meta.dirname, "../testing/google-trends-feed.xml"),
  "utf8",
);

it("parses the saved Trending Now feed", () => {
  const items = parseTrendingFeed(feed);
  expect(items).toHaveLength(10);
  expect(items[0]).toEqual({
    term: "rihanna",
    approxTraffic: 100,
    publishedAt: new Date("2026-10-10T10:10:00.000Z"),
    newsUrl:
      "https://people.com/rihanna-and-her-three-kids-savage-x-fenty-holiday-campaign-12166001",
  });
  expect(items.every((i) => i.term.length > 0)).toBe(true);
});

it("reads traffic labels as lower bounds", () => {
  expect(parseApproxTraffic("500+")).toBe(500);
  expect(parseApproxTraffic("10000+")).toBe(10_000);
  expect(parseApproxTraffic("1,000+")).toBe(1000);
  expect(parseApproxTraffic("2K+")).toBe(2000);
  expect(parseApproxTraffic("1.5M+")).toBe(1_500_000);
  expect(parseApproxTraffic("lots")).toBeNull();
  expect(parseApproxTraffic(undefined)).toBeNull();
});

it("handles entities, a missing item list and a changed shape", () => {
  const one = `<?xml version="1.0"?><rss xmlns:ht="x"><channel><item><title>tom &amp; jerry</title></item></channel></rss>`;
  expect(parseTrendingFeed(one)).toEqual([
    {
      term: "tom & jerry",
      approxTraffic: null,
      publishedAt: null,
      newsUrl: null,
    },
  ]);
  expect(parseTrendingFeed(`<rss><channel></channel></rss>`)).toEqual([]);
  expect(() => parseTrendingFeed(`<html><body>nope</body></html>`)).toThrow();
});

it("fetches the feed for a market and fails on an HTTP error", async () => {
  const calls: string[] = [];
  const ok = createGoogleTrendsClient({
    fetch: (async (url: string | URL | Request) => {
      calls.push(String(url));
      return new Response(feed, { status: 200 });
    }) as typeof fetch,
  });
  expect(await ok.trending("US")).toHaveLength(10);
  expect(calls).toEqual([`${GOOGLE_TRENDS_RSS}?geo=US`]);
  const failing = createGoogleTrendsClient({
    fetch: (async () => new Response("", { status: 429 })) as typeof fetch,
  });
  await expect(failing.trending("US")).rejects.toThrow("429");
});
