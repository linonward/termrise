import { expect, it, vi } from "vitest";

import { createDataForSeoProvider, GOOGLE_ADS_INTERVAL_MS } from "./dataforseo";
import { ADS, dataForSeoFetch, KD, SERP } from "../testing/dataforseo-fetch";

const market = { locationCode: 2840, languageCode: "en" };
const noSleep = async () => {};

it("expands a seed with Basic auth and maps metrics, null kept null", async () => {
  const { fetch, calls } = dataForSeoFetch({
    [ADS]: {
      cost: 0.075,
      result: [
        {
          keyword: "invoice tool",
          search_volume: 1900,
          competition: "HIGH",
          competition_index: 87,
          cpc: 4.12,
          monthly_searches: null,
        },
        {
          keyword: "invoice tool free",
          search_volume: 0,
          competition: null,
          competition_index: null,
          cpc: null,
        },
      ],
    },
  });
  const provider = createDataForSeoProvider({
    login: "me@example.com",
    password: "secret",
    fetch,
    sleep: noSleep,
  });
  expect(await provider.expand("invoice tool", market)).toEqual({
    costMicros: 75_000,
    value: [
      {
        phrase: "invoice tool",
        metrics: {
          searchVolume: 1900,
          cpcMicros: 4_120_000,
          adsCompetition: 87,
          keywordDifficulty: null,
        },
      },
      {
        phrase: "invoice tool free",
        metrics: {
          searchVolume: 0,
          cpcMicros: null,
          adsCompetition: null,
          keywordDifficulty: null,
        },
      },
    ],
  });
  expect(calls[0].headers.get("authorization")).toBe(
    `Basic ${btoa("me@example.com:secret")}`,
  );
  expect(calls[0].body).toEqual([
    {
      keywords: ["invoice tool"],
      location_code: 2840,
      language_code: "en",
      sort_by: "relevance",
    },
  ]);
});

it("reads difficulty in one call and leaves out keywords without it", async () => {
  const { fetch, calls } = dataForSeoFetch({
    [KD]: {
      cost: 0.01224,
      result: [
        {
          se_type: "google",
          items: [
            { keyword: "a", keyword_difficulty: 12 },
            { keyword: "b", keyword_difficulty: null },
          ],
        },
      ],
    },
  });
  const provider = createDataForSeoProvider({
    login: "l",
    password: "p",
    fetch,
  });
  const { value, costMicros } = await provider.difficulty!(["a", "b"], market);
  expect([...value]).toEqual([["a", 12]]);
  expect(costMicros).toBe(12_240);
  expect(calls[0].body).toEqual([
    { keywords: ["a", "b"], location_code: 2840, language_code: "en" },
  ]);
});

it("keeps the top 10 organic results only, in rank order", async () => {
  const items = [
    {
      type: "featured_snippet",
      rank_group: 1,
      title: "Snippet",
      url: "https://s.example",
    },
    ...Array.from({ length: 11 }, (_, i) => ({
      type: "organic",
      rank_group: 11 - i,
      rank_absolute: 12 - i,
      title: `Result ${11 - i}`,
      url: `https://r${11 - i}.example/`,
      domain: `r${11 - i}.example`,
    })),
  ];
  const { fetch, calls } = dataForSeoFetch({
    [SERP]: { cost: 0.002, result: [{ keyword: "x", items }] },
  });
  const provider = createDataForSeoProvider({
    login: "l",
    password: "p",
    fetch,
  });
  const { value, costMicros } = await provider.serp("x", market);
  expect(costMicros).toBe(2_000);
  expect(value).toHaveLength(10);
  expect(value[0]).toEqual({
    rank: 1,
    url: "https://r1.example/",
    title: "Result 1",
    type: "organic",
  });
  expect(value.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  expect(calls[0].body).toEqual([
    {
      keyword: "x",
      location_code: 2840,
      language_code: "en",
      device: "desktop",
      depth: 10,
    },
  ]);
});

it("returns no results for a SERP without items", async () => {
  const { fetch } = dataForSeoFetch({ [SERP]: { result: [{ items: null }] } });
  const provider = createDataForSeoProvider({
    login: "l",
    password: "p",
    fetch,
  });
  expect((await provider.serp("x", market)).value).toEqual([]);
});

it("fails on an HTTP error or a failed status, without credentials", async () => {
  const cases = [
    { status: 401 },
    { statusCode: 40100 },
    { taskStatusCode: 40501 },
  ];
  for (const route of cases) {
    const { fetch } = dataForSeoFetch({ [SERP]: route });
    const provider = createDataForSeoProvider({
      login: "me@example.com",
      password: "secret-password",
      fetch,
    });
    const error: Error = await provider.serp("x", market).then(
      () => new Error("expected a failure"),
      (e: Error) => e,
    );
    expect(error.message).toMatch(/DataForSEO .*(401|40100|40501)/);
    expect(error.message).not.toContain("secret-password");
    expect(error.message).not.toContain("me@example.com");
  }
});

it("spaces Google Ads calls to 12 a minute", async () => {
  let clock = 0;
  const sleep = vi.fn(async (ms: number) => {
    clock += ms;
  });
  const { fetch } = dataForSeoFetch({ [ADS]: { result: [] } });
  const provider = createDataForSeoProvider({
    login: "l",
    password: "p",
    fetch,
    sleep,
    now: () => clock,
  });
  await provider.expand("a", market);
  await provider.expand("b", market);
  await provider.expand("c", market);
  expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([
    GOOGLE_ADS_INTERVAL_MS,
    GOOGLE_ADS_INTERVAL_MS,
  ]);
});
