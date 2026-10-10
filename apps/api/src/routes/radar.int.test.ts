import { afterAll, beforeEach, expect, it } from "vitest";

import { closeTestDb, resetDb, testDb } from "@repo/db/testing/db";
import { createFakeHackerNews } from "@repo/research/adapters/fake-hacker-news";
import { createRadar } from "@repo/research/radar";

import { createTestClient } from "../testing/client";
import { TEST_APP_URL } from "../testing/worker";

const { call, signIn } = createTestClient();

let cookie: string;
beforeEach(async () => {
  await resetDb();
  cookie = await signIn("reader@example.com");
  // The worker's collection, with a fake source.
  await createRadar({
    database: testDb(),
    hackerNews: createFakeHackerNews({
      lists: { top: [1, 2], show: [1] },
      items: [
        {
          id: 1,
          type: "story",
          title: "Show HN: Invoice parser",
          url: "https://invoice.example",
          time: 1_760_000_000,
          score: 5,
          descendants: 2,
        },
        { id: 2, type: "story", title: "Meeting notes", score: 50 },
      ],
    }),
  }).collectHackerNews();
});
afterAll(closeTestDb);

const get = (path: string, withCookie = true) =>
  call(path, { headers: withCookie ? { cookie } : {} });

it("lists radar items for any signed-in user, filtered and sorted", async () => {
  const all = await (await get("/api/radar/items?sort=score")).json();
  expect(all.items.map((i: { title: string }) => i.title)).toEqual([
    "Meeting notes",
    "Show HN: Invoice parser",
  ]);
  const filtered = await (await get("/api/radar/items?q=invoice")).json();
  expect(filtered.items).toHaveLength(1);
  expect(filtered.items[0]).toMatchObject({
    provider: "hacker_news",
    term: "invoice parser",
    suggestedSeed: "invoice parser",
    url: "https://invoice.example/",
    discussionUrl: "https://news.ycombinator.com/item?id=1",
    score: 5,
    comments: 2,
  });

  const other = await signIn("other@example.com");
  const seen = await (
    await call("/api/radar/items", { headers: { cookie: other } })
  ).json();
  expect(seen.items).toHaveLength(2);
});

it("shows one item with its observations", async () => {
  const { items } = await (await get("/api/radar/items?q=invoice")).json();
  const response = await get(`/api/radar/items/${items[0].id}`);
  expect(response.status).toBe(200);
  const detail = await response.json();
  expect(detail.observations).toEqual([
    expect.objectContaining({ list: "show", rank: 1, score: 5, comments: 2 }),
    expect.objectContaining({ list: "top", rank: 1, score: 5, comments: 2 }),
  ]);
});

it("returns 404 for an unknown item and 401 without a session", async () => {
  const missing = await get("/api/radar/items/not-a-uuid");
  expect(missing.status).toBe(404);
  expect((await missing.json()).error.code).toBe("RADAR_ITEM_NOT_FOUND");
  expect((await get("/api/radar/items", false)).status).toBe(401);
});

it("stars and unstars an item, and lists the starred only", async () => {
  const { items } = await (await get("/api/radar/items?q=invoice")).json();
  const path = `/api/radar/items/${items[0].id}/star`;
  const send = (method: string) =>
    call(path, {
      method,
      headers: { cookie, Origin: TEST_APP_URL },
    });
  expect(await (await send("PUT")).json()).toEqual({ starred: true });
  const starred = await (await get("/api/radar/items?starred=1")).json();
  expect(starred.items.map((i: { starred: boolean }) => i.starred)).toEqual([
    true,
  ]);
  expect(await (await send("DELETE")).json()).toEqual({ starred: false });
  expect(
    (await (await get("/api/radar/items?starred=1")).json()).items,
  ).toEqual([]);
});
