import type { TrendingNowItem } from "google-trends-now";
import { expect, it } from "vitest";

import { trendingNames, trendingPhrases } from "./trending-now";

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
