import { expect, it } from "vitest";

import { createDirectTrends, stripPrefix } from "./google-trends-direct";

// Shapes as Google sent them on 2026-11-21 (US, past 90 days).
const explore = `)]}'\n${JSON.stringify({
  widgets: [
    {
      id: "TIMESERIES",
      token: "tok",
      request: { time: "2026-08-21 2026-11-21" },
    },
    { id: "GEO_MAP", token: "x" },
  ],
})}`;
const multiline = `)]}',\n${JSON.stringify({
  default: {
    timelineData: [
      { time: "1795046400", value: [3, 70], hasData: [true, true] },
      { time: "1795132800", value: [0, 68], hasData: [false, true] },
      { time: "1795219200", value: [5, 54], isPartial: true },
    ],
  },
})}`;

function fakeGoogle(status = 200) {
  const urls: string[] = [];
  const cookies: (string | null)[] = [];
  const fake = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    urls.push(url);
    cookies.push(new Headers(init?.headers).get("cookie"));
    if (url.includes("/trends/?geo=US"))
      return new Response("<html/>", {
        headers: { "set-cookie": "NID=abc; Path=/; HttpOnly" },
      });
    if (status !== 200) return new Response("", { status });
    if (url.includes("/api/explore")) return new Response(explore);
    if (url.includes("/widgetdata/multiline")) return new Response(multiline);
    return new Response("", { status: 404 });
  }) as typeof globalThis.fetch;
  return { fetch: fake, urls, cookies };
}

it("strips Google's prefix", () => {
  expect(stripPrefix(`)]}'\n{"a":1}`)).toEqual({ a: 1 });
  expect(stripPrefix(`)]}',\n{"a":1}`)).toEqual({ a: 1 });
});

it("gets a cookie, then the widget token, then the daily values without the partial day", async () => {
  let clock = 0;
  const slept: number[] = [];
  const g = fakeGoogle();
  const t = createDirectTrends({
    fetch: g.fetch,
    now: () => clock,
    sleep: async (ms) => {
      slept.push(ms);
      clock += ms;
    },
    minGapMs: 8_000,
  });
  expect(await t.compare(["goodbye gta 5", "gpts"])).toEqual([
    { at: "2026-11-19T00:00:00.000Z", values: [3, 70] },
    { at: "2026-11-20T00:00:00.000Z", values: [0, 68] },
  ]);
  expect(g.urls).toHaveLength(3);
  const req = JSON.parse(
    decodeURIComponent(new URL(g.urls[1]).searchParams.get("req")!),
  );
  expect(req.comparisonItem).toEqual([
    { keyword: "goodbye gta 5", geo: "US", time: "today 3-m" },
    { keyword: "gpts", geo: "US", time: "today 3-m" },
  ]);
  expect(new URL(g.urls[2]).searchParams.get("token")).toBe("tok");
  expect(g.cookies.slice(1)).toEqual(["NID=abc", "NID=abc"]);
  // Calls are spaced out.
  expect(slept).toEqual([8_000, 8_000]);
});

it("stays off for a cool-down after Google refuses", async () => {
  let clock = 0;
  const t = createDirectTrends({
    fetch: fakeGoogle(429).fetch,
    now: () => clock,
    sleep: async () => {},
    minGapMs: 0,
    coolDownMs: 60_000,
  });
  await expect(t.compare(["a", "gpts"])).rejects.toThrow("http 429");
  expect(t.available()).toBe(false);
  await expect(t.compare(["a", "gpts"])).rejects.toThrow("cooling down");
  clock += 60_000;
  expect(t.available()).toBe(true);
});

it("reads each root's rising queries, with Breakout as 5000%", async () => {
  const urls: string[] = [];
  const fake = (async (input: string | URL | Request) => {
    const url = String(input);
    urls.push(url);
    if (url.includes("/trends/?geo=US"))
      return new Response("", { headers: { "set-cookie": "NID=1; Path=/" } });
    if (url.includes("/api/explore"))
      return new Response(
        `)]}'\n${JSON.stringify({
          widgets: [
            { id: "RELATED_QUERIES_0", token: "t0", request: { k: 0 } },
            { id: "RELATED_QUERIES_1", token: "t1", request: { k: 1 } },
          ],
        })}`,
      );
    const token = new URL(url).searchParams.get("token");
    return new Response(
      `)]}',\n${JSON.stringify({
        default: {
          rankedList: [
            { rankedKeyword: [{ query: "top one", value: 100 }] },
            {
              rankedKeyword:
                token === "t0"
                  ? [
                      {
                        query: "gta 6 filter",
                        value: 500,
                        formattedValue: "+500%",
                      },
                      {
                        query: "huss huss meme",
                        value: 3200,
                        formattedValue: "Breakout",
                      },
                    ]
                  : [],
            },
          ],
        },
      })}`,
    );
  }) as typeof globalThis.fetch;
  const t = createDirectTrends({
    fetch: fake,
    sleep: async () => {},
    minGapMs: 0,
  });
  const r = await t.rising(["filter", "meme"]);
  expect(r.get("filter")).toEqual([
    { query: "gta 6 filter", value: 500 },
    { query: "huss huss meme", value: 5000 },
  ]);
  expect(r.get("meme")).toEqual([]);
  // One explore call for both roots, then one widget call each.
  expect(urls.filter((u) => u.includes("/api/explore"))).toHaveLength(1);
  expect(urls.filter((u) => u.includes("relatedsearches"))).toHaveLength(2);
});
