import { z } from "zod";

// The official Hacker News API (https://github.com/HackerNews/API): public JSON, no key.
// It has no search: only the story lists and one item per request.
export const HACKER_NEWS_API = "https://hacker-news.firebaseio.com/v0";
export const HACKER_NEWS_ITEM_URL = "https://news.ycombinator.com/item?id=";

/** Lists the radar reads, by the API's names (up to 500 ids for top, 200 for show). */
export const HACKER_NEWS_LISTS = {
  top: "topstories",
  show: "showstories",
} as const;
export type HackerNewsList = keyof typeof HACKER_NEWS_LISTS;

// The fields the radar uses; the API leaves out any field without a value.
const itemSchema = z.object({
  id: z.number().int(),
  type: z.string().optional(),
  deleted: z.boolean().optional(),
  dead: z.boolean().optional(),
  title: z.string().optional(),
  url: z.string().optional(),
  time: z.number().int().optional(),
  score: z.number().int().optional(),
  descendants: z.number().int().optional(),
});
export type HackerNewsItem = z.output<typeof itemSchema>;

export interface HackerNewsSource {
  /** Story ids on a list, in the list's order. */
  storyIds(list: HackerNewsList): Promise<number[]>;
  /** One item; null when it does not exist. */
  item(id: number): Promise<HackerNewsItem | null>;
}

export function createHackerNewsClient(
  deps: { fetch?: typeof fetch; baseUrl?: string; timeoutMs?: number } = {},
): HackerNewsSource {
  const fetcher = deps.fetch ?? globalThis.fetch;
  const baseUrl = deps.baseUrl ?? HACKER_NEWS_API;
  const timeoutMs = deps.timeoutMs ?? 10_000;

  async function get(path: string) {
    const response = await fetcher(`${baseUrl}/${path}`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok)
      throw new Error(`Hacker News ${path} returned ${response.status}`);
    return response.json() as Promise<unknown>;
  }

  return {
    async storyIds(list) {
      return z
        .array(z.number().int())
        .parse(await get(`${HACKER_NEWS_LISTS[list]}.json`));
    },
    async item(id) {
      const body = await get(`item/${id}.json`);
      return body === null ? null : itemSchema.parse(body);
    },
  };
}
