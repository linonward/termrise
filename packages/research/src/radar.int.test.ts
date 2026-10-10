import { afterAll, beforeEach, expect, it } from "vitest";

import { radarObservations } from "@repo/db/schema";
import { closeTestDb, resetDb, testDb } from "@repo/db/testing/db";

import { createFakeHackerNews } from "./adapters/fake-hacker-news";
import type { TrendingSearch } from "./adapters/google-trends";
import type { HackerNewsItem } from "./adapters/hacker-news";
import { createRadar } from "./radar";
import { toRadarItemDto } from "./radar-dto";

const db = testDb();
beforeEach(resetDb);
afterAll(closeTestDb);

const story = (id: number, extra: Partial<HackerNewsItem> = {}) => ({
  id,
  type: "story",
  title: `Show HN: Story ${id}`,
  url: `https://example.com/${id}`,
  time: 1_760_000_000,
  score: id * 10,
  descendants: id,
  ...extra,
});

let clock = new Date("2026-10-10T08:00:00Z");
const now = () => clock;

it("saves stories from both lists with one observation per list", async () => {
  const radar = createRadar({
    database: db,
    now,
    hackerNews: createFakeHackerNews({
      lists: { top: [1, 2, 3, 4], show: [2, 5] },
      items: [
        story(1),
        story(2),
        story(3, { type: "job" }),
        story(4, { dead: true }),
        story(5, { url: "javascript:alert(1)", score: undefined }),
      ],
    }),
  });
  expect(await radar.collectHackerNews()).toEqual({
    saved: 3,
    skipped: 2,
    failed: 0,
  });
  const items = await radar.list("u");
  expect(items.map((i) => i.externalId).sort()).toEqual(["1", "2", "5"]);
  const five = items.find((i) => i.externalId === "5")!;
  expect(toRadarItemDto(five)).toMatchObject({
    provider: "hacker_news",
    title: "Show HN: Story 5",
    term: "story 5",
    suggestedSeed: "story 5",
    url: null,
    sourceUrl: "https://news.ycombinator.com/item?id=5",
    postedAt: "2025-10-09T08:53:20.000Z",
    firstSeenAt: "2026-10-10T08:00:00.000Z",
    score: null,
    comments: 5,
  });
  const two = items.find((i) => i.externalId === "2")!;
  const { observations } = await radar.get("u", two.id);
  expect(observations.map((o) => ({ list: o.list, rank: o.rank }))).toEqual([
    { list: "show", rank: 1 },
    { list: "top", rank: 2 },
  ]);
});

it("keeps first seen and appends observations on the next collection", async () => {
  const data = {
    lists: { top: [1] },
    items: [story(1, { score: 10 })],
  };
  const radar = createRadar({
    database: db,
    now,
    hackerNews: createFakeHackerNews(data),
  });
  clock = new Date("2026-10-10T08:00:00Z");
  await radar.collectHackerNews();
  data.items = [story(1, { score: 99, title: "Show HN: Renamed" })];
  clock = new Date("2026-10-10T09:00:00Z");
  await radar.collectHackerNews();

  const [item] = await radar.list("u");
  expect(item).toMatchObject({
    title: "Show HN: Renamed",
    score: 99,
    firstSeenAt: new Date("2026-10-10T08:00:00Z"),
    lastSeenAt: new Date("2026-10-10T09:00:00Z"),
  });
  const { observations } = await radar.get("u", item.id);
  expect(observations.map((o) => o.score)).toEqual([99, 10]);
});

it("skips a failing story and fails only when every story fails", async () => {
  const some = createRadar({
    database: db,
    now,
    hackerNews: createFakeHackerNews({
      lists: { top: [1, 2] },
      items: [story(1), story(2)],
      failing: [2],
    }),
  });
  expect(await some.collectHackerNews()).toEqual({
    saved: 1,
    skipped: 0,
    failed: 1,
  });
  const all = createRadar({
    database: db,
    now,
    hackerNews: createFakeHackerNews({
      lists: { top: [1, 2] },
      items: [],
      failing: [1, 2],
    }),
  });
  await expect(all.collectHackerNews()).rejects.toThrow();
});

it("reads only the first stories of each list", async () => {
  const radar = createRadar({
    database: db,
    now,
    hackerNews: createFakeHackerNews({
      lists: { top: [1, 2, 3] },
      items: [story(1), story(2), story(3)],
    }),
  });
  await radar.collectHackerNews({ limit: 2 });
  expect(await db.$count(radarObservations)).toBe(2);
});

it("filters by term and sorts by score", async () => {
  const radar = createRadar({
    database: db,
    now,
    hackerNews: createFakeHackerNews({
      lists: { top: [1, 2, 3] },
      items: [
        story(1, { title: "Invoice tool 100%" }),
        story(2, { title: "Meeting notes" }),
        story(3, { title: "Invoice parser", score: undefined }),
      ],
    }),
  });
  await radar.collectHackerNews();
  const titles = async (query: Record<string, string>) =>
    (await radar.list("u", query)).map((i) => i.title);
  expect(await titles({ q: "INVOICE", sort: "score" })).toEqual([
    "Invoice tool 100%",
    "Invoice parser",
  ]);
  expect(await titles({ q: "100%" })).toEqual(["Invoice tool 100%"]);
  expect(await titles({ q: "_" })).toEqual([]);
  expect(await titles({ sort: "score" })).toEqual([
    "Meeting notes",
    "Invoice tool 100%",
    "Invoice parser",
  ]);
  // An unknown sort falls back to the default.
  expect(await titles({ sort: "nope" })).toHaveLength(3);
});

it("returns not found for an unknown or invalid id", async () => {
  const radar = createRadar({ database: db });
  await expect(radar.get("u", "not-a-uuid")).rejects.toMatchObject({
    code: "RADAR_ITEM_NOT_FOUND",
  });
  await expect(
    radar.get("u", "00000000-0000-4000-8000-000000000000"),
  ).rejects.toMatchObject({ code: "RADAR_ITEM_NOT_FOUND" });
});

it("shows a lifecycle from the observations and earlier items of the term", async () => {
  const data = {
    lists: { top: [1] },
    items: [story(1, { title: "Show HN: Invoice parser", score: 10 })],
  };
  const radar = createRadar({
    database: db,
    now,
    hackerNews: createFakeHackerNews(data),
  });
  clock = new Date("2026-10-10T08:00:00Z");
  await radar.collectHackerNews();
  expect((await radar.list("u"))[0].lifecycle).toBe("insufficient_data");
  for (const [hour, score] of [
    [10, 60],
    [12, 180],
  ] as const) {
    data.items = [story(1, { title: "Show HN: Invoice parser", score })];
    clock = new Date(`2026-10-10T${hour}:00:00Z`);
    await radar.collectHackerNews();
  }
  const [item] = await radar.list("u");
  expect(toRadarItemDto(item).lifecycle).toBe("breakout");
  expect((await radar.get("u", item.id)).item.lifecycle).toBe("breakout");

  // The same term again, 10 days later, in another story.
  data.lists = { top: [2] };
  data.items = [story(2, { title: "Invoice parser" })];
  clock = new Date("2026-10-20T08:00:00Z");
  await radar.collectHackerNews();
  const again = (await radar.list("u")).find((i) => i.externalId === "2")!;
  expect(again.lifecycle).toBe("recurring");
});

it("saves Google Trends searches, one item per market, day and term", async () => {
  const searches: TrendingSearch[] = [
    {
      term: "Atlanta Airport",
      approxTraffic: 500,
      publishedAt: new Date("2026-10-10T07:00:00Z"),
      newsUrl: "https://news.example/a",
    },
    { term: "  ", approxTraffic: null, publishedAt: null, newsUrl: null },
  ];
  const radar = createRadar({
    database: db,
    now,
    googleTrends: { trending: async () => searches },
  });
  clock = new Date("2026-10-10T08:00:00Z");
  expect(await radar.collectGoogleTrends("US")).toEqual({
    saved: 1,
    skipped: 1,
    failed: 0,
  });
  // The same search an hour later is the same item, with a new observation.
  clock = new Date("2026-10-10T09:00:00Z");
  searches[0] = { ...searches[0]!, approxTraffic: 1000 };
  await radar.collectGoogleTrends("US");

  const [item] = await radar.list("u");
  expect(toRadarItemDto(item)).toMatchObject({
    provider: "google_trends",
    title: "Atlanta Airport",
    term: "atlanta airport",
    url: "https://news.example/a",
    sourceUrl: "https://trends.google.com/trending?geo=US",
    score: 1000,
    comments: null,
    // Traffic ranges are not points: no growth is measured.
    lifecycle: "insufficient_data",
  });
  const { observations } = await radar.get("u", item.id);
  expect(observations.map((o) => [o.list, o.rank, o.score])).toEqual([
    ["trending", 1, 1000],
    ["trending", 1, 500],
  ]);

  // Trending again 10 days later: a new item, recurring.
  searches[0] = {
    ...searches[0]!,
    publishedAt: new Date("2026-10-20T07:00:00Z"),
  };
  clock = new Date("2026-10-20T08:00:00Z");
  await radar.collectGoogleTrends("US");
  const items = await radar.list("u");
  expect(items).toHaveLength(2);
  expect(items[0].lifecycle).toBe("recurring");
});
