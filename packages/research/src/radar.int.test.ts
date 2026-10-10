import { afterAll, beforeEach, expect, it } from "vitest";

import { radarObservations } from "@repo/db/schema";
import { closeTestDb, resetDb, testDb } from "@repo/db/testing/db";

import { createFakeHackerNews } from "./adapters/fake-hacker-news";
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
  const items = await radar.list();
  expect(items.map((i) => i.externalId).sort()).toEqual(["1", "2", "5"]);
  const five = items.find((i) => i.externalId === "5")!;
  expect(toRadarItemDto(five)).toMatchObject({
    provider: "hacker_news",
    title: "Show HN: Story 5",
    term: "story 5",
    suggestedSeed: "story 5",
    url: null,
    discussionUrl: "https://news.ycombinator.com/item?id=5",
    postedAt: "2025-10-09T08:53:20.000Z",
    firstSeenAt: "2026-10-10T08:00:00.000Z",
    score: null,
    comments: 5,
  });
  const two = items.find((i) => i.externalId === "2")!;
  const { observations } = await radar.get(two.id);
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

  const [item] = await radar.list();
  expect(item).toMatchObject({
    title: "Show HN: Renamed",
    score: 99,
    firstSeenAt: new Date("2026-10-10T08:00:00Z"),
    lastSeenAt: new Date("2026-10-10T09:00:00Z"),
  });
  const { observations } = await radar.get(item.id);
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
    (await radar.list(query)).map((i) => i.title);
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
  await expect(radar.get("not-a-uuid")).rejects.toMatchObject({
    code: "RADAR_ITEM_NOT_FOUND",
  });
  await expect(
    radar.get("00000000-0000-4000-8000-000000000000"),
  ).rejects.toMatchObject({ code: "RADAR_ITEM_NOT_FOUND" });
});
