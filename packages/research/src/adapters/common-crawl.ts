// Common Crawl's URL index (index.commoncrawl.org): the hosts of a free hosting platform
// that the crawl saw this month. Free to read; the server often answers 502 or 504 under
// load, so each request is tried a few times.
import { z } from "zod";

import { PLATFORMS } from "@repo/db/schema";

export type Platform = (typeof PLATFORMS)[number];

export const COMMON_CRAWL_INDEX = "https://index.commoncrawl.org";
const USER_AGENT = "termrise-platform-sites/1.0 (+https://termrise.com)";
const TRIES = 4;

// Preview deployments and throwaway sites: they do not rank and cost a lookup each.
const PREVIEW = /-git-|-(?=[a-z]*\d)[a-z0-9]{9}-[a-z0-9-]+$/;
const THROWAWAY =
  /(^|-)(test|tests|testing|demo|preview|staging|dev|tmp|temp)(-|\d|$)/;

/** The platform subdomain a URL is on; null for previews, test sites and other hosts. */
export function platformHost(url: string) {
  let hostname: string;
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  const platform = PLATFORMS.find((p) => hostname.endsWith(`.${p}`));
  if (!platform) return null;
  const name = hostname.slice(0, -platform.length - 1);
  // A deeper name is a deployment of a site, e.g. a1b2c3d4.tool.pages.dev.
  if (!name || name.includes(".") || /^\d+$/.test(name)) return null;
  if (PREVIEW.test(name) || THROWAWAY.test(name)) return null;
  return { host: hostname, platform };
}

export interface CommonCrawl {
  /** The id of the newest collection, e.g. CC-MAIN-2026-43. */
  latestCollection(): Promise<string>;
  /** How many index pages list the platform's URLs in the collection. */
  pages(collection: string, platform: Platform): Promise<number>;
  /** The distinct production hosts on one index page, in index order. */
  hosts(
    collection: string,
    platform: Platform,
    page: number,
  ): Promise<string[]>;
}

export function createCommonCrawl(
  deps: {
    fetch?: typeof fetch;
    sleep?: (ms: number) => Promise<void>;
    baseUrl?: string;
  } = {},
): CommonCrawl {
  const fetcher = deps.fetch ?? fetch;
  const sleep =
    deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const base = deps.baseUrl ?? COMMON_CRAWL_INDEX;

  async function get(url: string) {
    let status = 0;
    for (let attempt = 0; attempt < TRIES; attempt++) {
      if (attempt) await sleep(5_000 * 2 ** (attempt - 1));
      const res = await fetcher(url, {
        headers: { "user-agent": USER_AGENT },
        signal: AbortSignal.timeout(120_000),
      }).catch(() => null);
      if (res?.ok) return res.text();
      status = res?.status ?? 0;
      // 404: the index has no URLs for this query.
      if (status === 404) return "";
      if (status && status < 500 && status !== 429) break;
    }
    throw new Error(`Common Crawl returned ${status || "no response"}`);
  }

  const index = (collection: string, platform: Platform, query: string) =>
    `${base}/${collection}-index?url=*.${platform}&output=json&${query}`;

  return {
    async latestCollection() {
      const list = z
        .array(z.object({ id: z.string() }))
        .min(1)
        .parse(JSON.parse(await get(`${base}/collinfo.json`)));
      return list[0].id;
    },
    async pages(collection, platform) {
      const text = await get(index(collection, platform, "showNumPages=true"));
      if (!text) return 0;
      return z
        .object({ pages: z.number().int().min(0) })
        .parse(JSON.parse(text)).pages;
    },
    async hosts(collection, platform, page) {
      const text = await get(
        index(collection, platform, `fl=url&page=${page}`),
      );
      const seen = new Set<string>();
      for (const line of text.split("\n")) {
        if (!line.trim()) continue;
        let url: unknown;
        try {
          url = (JSON.parse(line) as { url?: unknown }).url;
        } catch {
          continue;
        }
        if (typeof url !== "string") continue;
        const site = platformHost(url);
        if (site?.platform === platform) seen.add(site.host);
      }
      return [...seen];
    },
  };
}
