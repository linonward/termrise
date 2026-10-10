import type {
  HackerNewsItem,
  HackerNewsList,
  HackerNewsSource,
} from "./hacker-news";

/** An item id in this set makes the fake source fail for it, so tests can check it. */
export type FakeHackerNews = {
  lists: Partial<Record<HackerNewsList, number[]>>;
  items: HackerNewsItem[];
  failing?: number[];
};

// Hacker News without the network: tests and E2E give the lists and items.
export function createFakeHackerNews(data: FakeHackerNews): HackerNewsSource {
  return {
    async storyIds(list) {
      return data.lists[list] ?? [];
    },
    async item(id) {
      if (data.failing?.includes(id)) throw new Error(`fake failure ${id}`);
      return data.items.find((item) => item.id === id) ?? null;
    },
  };
}
