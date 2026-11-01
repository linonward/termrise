import type { TrendingNowItem } from "google-trends-now";
import { expect, it } from "vitest";

import {
  createTrendingNow,
  trendingNames,
  trendingPhrases,
} from "./trending-now";

const item = (query: string, ...categories: string[]) =>
  ({
    query,
    categories: categories.map((name, id) => ({ id, name })),
  }) as unknown as TrendingNowItem;

it("keeps the trends that are not news", () => {
  expect(
    trendingPhrases([
      item("michigan vs rutgers", "Sports"),
      item("Qwen 3.8 Flash", "Technology"),
      item("pumpkin carving stencil", "Hobbies and Leisure"),
      item("senate vote", "Politics", "Law and Government"),
      item("new show cast", "Entertainment"),
      item("mystery word"),
    ]),
  ).toEqual(["qwen 3.8 flash", "pumpkin carving stencil", "mystery word"]);
});

it("rates a trend by its search volume and dates it from its start", () => {
  const trend = (query: string, search_volume: number) =>
    ({
      query,
      search_volume,
      started_at: "2026-11-01T02:00:00Z",
      categories: [],
    }) as unknown as TrendingNowItem;
  expect(
    trendingNames([
      trend("big", 200_000),
      trend("mid", 20_000),
      trend("small", 2_000),
    ]),
  ).toEqual([
    { name: "big", heat: 3, releasedAt: "2026-11-01T02:00:00Z" },
    { name: "mid", heat: 2, releasedAt: "2026-11-01T02:00:00Z" },
    { name: "small", heat: 1, releasedAt: "2026-11-01T02:00:00Z" },
  ]);
});

it("reads all of the US and the technology trends of four more countries", async () => {
  const asked: { geo?: string; category?: string | number }[] = [];
  const trend = (query: string, search_volume: number) =>
    ({
      query,
      search_volume,
      started_at: null,
      categories: [],
    }) as unknown as TrendingNowItem;
  const source = createTrendingNow({
    fetchTrends: async (o) => {
      asked.push({ geo: o.geo, category: o.category });
      if (o.geo === "IN") throw new Error("429");
      return {
        fetch_status: "ok",
        items:
          o.geo === "US"
            ? [trend("pumpkin stencil", 30_000)]
            : [trend("lumo edit", 5_000), trend("pumpkin stencil", 1_000)],
      } as never;
    },
  });
  expect(await source.names(10)).toEqual([
    { name: "pumpkin stencil", heat: 2, releasedAt: null },
    { name: "lumo edit", heat: 1, releasedAt: null },
  ]);
  expect(asked).toEqual([
    { geo: "US", category: undefined },
    { geo: "GB", category: 18 },
    { geo: "CA", category: 18 },
    { geo: "AU", category: 18 },
    { geo: "IN", category: 18 },
  ]);
});
