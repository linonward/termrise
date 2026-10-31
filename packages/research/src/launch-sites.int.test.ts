import { afterAll, beforeEach, expect, it } from "vitest";

import { closeTestDb, resetDb, testDb } from "@repo/db/testing/db";

import { createFakeHackerNews } from "./adapters/fake-hacker-news";
import { createFakeLaunchSiteAnalyst } from "./adapters/fake-launch-sites";
import { createRdapClient } from "./adapters/rdap";
import { createBudget } from "./budget";
import { createLaunchSites, siteOf } from "./launch-sites";

const db = testDb();
let clock = new Date("2026-10-31T12:00:00Z");
const now = () => clock;
const t = (iso: string) => Date.parse(iso) / 1000;

const hackerNews = createFakeHackerNews({
  lists: { show: [101, 102, 103], new: [104, 101] },
  items: [
    {
      id: 101,
      type: "story",
      by: "maya",
      title: "Show HN: Cursed Cam, a haunted CCTV monitor",
      url: "https://www.cursedcam.com/",
      time: t("2026-10-31T11:34:00Z"),
      score: 2,
      descendants: 1,
      kids: [201, 202],
    },
    {
      id: 201,
      type: "comment",
      by: "maya",
      text: "I built this because my kids love <i>ghost</i> stories",
    },
    { id: 202, type: "comment", by: "someone", text: "nice" },
    {
      id: 102,
      type: "story",
      by: "lee",
      title: "Show HN: My repo",
      url: "https://github.com/lee/repo",
      time: t("2026-10-31T10:00:00Z"),
    },
    {
      id: 103,
      type: "story",
      by: "ann",
      title: "Show HN: Filepeek – view any file",
      url: "https://filepeek.vercel.app/x",
      time: t("2026-10-31T09:00:00Z"),
      score: 5,
    },
    {
      id: 104,
      type: "story",
      by: "bo",
      title: "Ask HN: what do you use?",
      url: "https://example.com",
      time: t("2026-10-31T08:00:00Z"),
    },
  ],
});
const rdap = createRdapClient({
  fetch: (async () =>
    Response.json({
      events: [
        { eventAction: "registration", eventDate: "2026-10-20T00:00:00Z" },
      ],
    })) as unknown as typeof fetch,
});
const sites = (ai = 1_000_000) =>
  createLaunchSites({
    database: db,
    hackerNews,
    analyst: createFakeLaunchSiteAnalyst(),
    rdap,
    budget: createBudget({
      database: db,
      now,
      dailyNewWordCapMicros: { data: 0, ai },
    }),
    pageTitle: async (url) => (url.includes("cursedcam") ? "Cursed Cam" : null),
    now,
  });

beforeEach(async () => {
  clock = new Date("2026-10-31T12:00:00Z");
  await resetDb();
});
afterAll(closeTestDb);

it("keeps Show HN posts that launch a site, with the maker's own words", async () => {
  const s = sites();
  await s.scheduleEvery();
  const done = await s.run((await s.claim())!);
  expect(done.status).toBe("completed");
  const { items, counts, lastRound } = await s.list({});
  expect(items.map((i) => i.site)).toEqual([
    "cursedcam.com",
    "filepeek.vercel.app",
  ]);
  const cam = items[0];
  expect(cam).toMatchObject({
    postTitle: "Cursed Cam, a haunted CCTV monitor",
    makerWords: "I built this because my kids love ghost stories",
    registeredOn: "2026-10-20",
    pageTitle: "Cursed Cam",
    sourceUrl: "https://news.ycombinator.com/item?id=101",
    motive: "own_pain",
    stated: true,
  });
  // A platform subdomain has no registration of its own.
  expect(items[1]).toMatchObject({
    registeredOn: null,
    motive: "unstated",
    why: "原文未说明制作原因",
  });
  expect(counts).toEqual({ own_pain: 1, unstated: 1 });
  expect(lastRound?.status).toBe("completed");
});

it("does not read a post twice and runs every six hours", async () => {
  const s = sites();
  await s.scheduleEvery();
  await s.run((await s.claim())!);
  clock = new Date("2026-10-31T15:00:00Z");
  expect(await s.scheduleEvery()).toBeNull();
  clock = new Date("2026-10-31T18:01:00Z");
  await s.scheduleEvery();
  const again = await s.run((await s.claim())!);
  expect(again.report).toMatchObject({ added: 0 });
});

it("keeps sites without analysis when the AI budget is out, and analyses them later", async () => {
  const s = sites(0);
  await s.scheduleEvery();
  const done = await s.run((await s.claim())!);
  expect(done).toMatchObject({
    status: "partial",
    errorCode: "DAILY_BUDGET_EXHAUSTED",
  });
  expect((await s.list({})).counts).toEqual({ pending: 2 });
});

it("filters by motive, searches and hides", async () => {
  const s = sites();
  await s.scheduleEvery();
  await s.run((await s.claim())!);
  expect(
    (await s.list({ motive: "own_pain" })).items.map((i) => i.site),
  ).toEqual(["cursedcam.com"]);
  expect((await s.list({ q: "filepeek" })).total).toBe(1);
  const [first] = (await s.list({})).items;
  await s.hide(first.id, true);
  expect((await s.list({})).total).toBe(1);
});

it("ignores hosts that are not one site", () => {
  expect(siteOf("https://github.com/a/b")).toBeNull();
  expect(siteOf("https://www.Example.com/x")).toBe("example.com");
  expect(siteOf("ftp://x.com")).toBeNull();
});
