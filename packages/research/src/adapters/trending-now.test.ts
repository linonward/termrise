import type { TrendingNowItem } from "google-trends-now";
import { expect, it } from "vitest";

import { trendingPhrases } from "./trending-now";

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
