import { expect, it } from "vitest";

import { createHackerNewsClient, HACKER_NEWS_API } from "./hacker-news";

// A stub fetch: no network call in ordinary tests.
function stub(routes: Record<string, { status?: number; body: unknown }>) {
  const calls: string[] = [];
  const fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    const route = routes[url];
    if (!route) return new Response("null", { status: 404 });
    return new Response(JSON.stringify(route.body), {
      status: route.status ?? 200,
    });
  }) as typeof globalThis.fetch;
  return { fetch, calls };
}

it("reads a list and an item from the official API paths", async () => {
  const { fetch, calls } = stub({
    [`${HACKER_NEWS_API}/showstories.json`]: { body: [3, 2, 1] },
    [`${HACKER_NEWS_API}/item/3.json`]: {
      body: {
        id: 3,
        type: "story",
        by: "someone",
        title: "Show HN: Foo",
        url: "https://foo.example",
        time: 1_760_000_000,
        score: 42,
        descendants: 7,
        kids: [4, 5],
      },
    },
  });
  const client = createHackerNewsClient({ fetch });
  expect(await client.storyIds("show")).toEqual([3, 2, 1]);
  expect(await client.item(3)).toEqual({
    id: 3,
    type: "story",
    title: "Show HN: Foo",
    url: "https://foo.example",
    time: 1_760_000_000,
    score: 42,
    descendants: 7,
  });
  expect(calls).toEqual([
    `${HACKER_NEWS_API}/showstories.json`,
    `${HACKER_NEWS_API}/item/3.json`,
  ]);
});

it("returns null for an item that does not exist", async () => {
  const { fetch } = stub({
    [`${HACKER_NEWS_API}/item/9.json`]: { body: null },
  });
  expect(await createHackerNewsClient({ fetch }).item(9)).toBeNull();
});

it("throws on an HTTP error or an unexpected body", async () => {
  const { fetch } = stub({
    [`${HACKER_NEWS_API}/topstories.json`]: { status: 503, body: {} },
    [`${HACKER_NEWS_API}/item/1.json`]: { body: { id: "one" } },
  });
  const client = createHackerNewsClient({ fetch });
  await expect(client.storyIds("top")).rejects.toThrow("503");
  await expect(client.item(1)).rejects.toThrow();
});
