import { expect, it, vi } from "vitest";

import { ProviderAuthError } from "@repo/ai/provider-errors";

import { createDataForSeoProvider, GOOGLE_ADS_INTERVAL_MS } from "./dataforseo";
import {
  ADS,
  dataForSeoFetch,
  KD,
  RANKED,
  SERP,
  SUGGESTIONS,
  TRAFFIC,
  TREND,
} from "../testing/dataforseo-fetch";
import labsRanked from "../testing/labs-ranked-cipherdecipher.json";
import labsSuggestions from "../testing/labs-suggestions-cipher.json";
import labsTraffic from "../testing/labs-traffic.json";
import serpCipherDecoder from "../testing/serp-cipher-decoder.json";
import trendsCipherDecoder from "../testing/trends-cipher-decoder.json";
import trendsRisingAi from "../testing/trends-rising-ai.json";
import trendsVsGpts from "../testing/trends-vs-gpts.json";

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
    site: "r1.example",
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

it("names the real site of results behind a google.com/goto redirect", async () => {
  // A real response (2026-10-31): Google wraps most organic results in a goto link,
  // and DataForSEO reports both url and domain as google.com.
  const { fetch } = dataForSeoFetch({
    [SERP]: { cost: 0.002, result: [{ items: serpCipherDecoder.items }] },
  });
  const provider = createDataForSeoProvider({
    login: "l",
    password: "p",
    fetch,
  });
  const { value } = await provider.serp("cipher decoder", market);
  expect(value.map((r) => r.site)).toEqual([
    "Reddit",
    "kloudbean.com",
    "cipherdecipher.com",
    "cryptii.com",
    "hanginghyena.com",
    "Reddit",
    "cipherchronicle.com",
    "play.google.com",
  ]);
  // A home page behind the redirect gets its own address, so it still counts as one.
  expect(value[2].url).toBe("https://www.cipherdecipher.com");
  // An inner page keeps the redirect: the breadcrumb shortens the path.
  expect(value[1].url).toMatch(/^https:\/\/google\.com\/goto\?/);
  expect(value[3].url).toBe(
    "https://cryptii.com/pipes/alphabetical-substitution/",
  );
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
    // A rejected login is an auth failure: the run says so, and the call is not billed.
    expect(error instanceof ProviderAuthError).toBe(
      "status" in route || "statusCode" in route,
    );
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

const provider = (routes: Parameters<typeof dataForSeoFetch>[0]) => {
  const { fetch, calls } = dataForSeoFetch(routes);
  return {
    calls,
    provider: createDataForSeoProvider({ login: "l", password: "p", fetch }),
  };
};

it("fetches keywords in a volume band with difficulty and monthly searches", async () => {
  const { calls, provider: p } = provider({
    [SUGGESTIONS]: labsSuggestions,
  });
  const band = { minVolume: 5000, maxVolume: 30000, limit: 6 };
  const { value, costMicros } = await p.suggestions!("cipher", market, band);
  expect(costMicros).toBe(12_720);
  // The seed (49,500 searches) is above the band, so it is not added.
  expect(value.map((i) => i.phrase)).toEqual([
    "cipher vigenere",
    "vigenère cipher",
    "vigenere cipher",
    "vernier cipher",
    "visionaire cipher",
    "cipher mining stock",
  ]);
  expect(value[5]).toMatchObject({
    metrics: {
      searchVolume: 18100,
      cpcMicros: 5_250_000,
      adsCompetition: 1,
      keywordDifficulty: 48,
    },
  });
  expect(value[0].metrics.cpcMicros).toBeNull();
  expect(value[0].monthlySearches).toHaveLength(12);
  expect(calls[0].body).toEqual([
    {
      keyword: "cipher",
      location_code: 2840,
      language_code: "en",
      include_seed_keyword: true,
      limit: 6,
      filters: [
        ["keyword_info.search_volume", ">=", 5000],
        "and",
        ["keyword_info.search_volume", "<=", 30000],
      ],
      order_by: ["keyword_info.search_volume,desc"],
    },
  ]);
});

it("adds the seed when its volume is in the band", async () => {
  const { provider: p } = provider({ [SUGGESTIONS]: labsSuggestions });
  const { value } = await p.suggestions!("cipher", market, {
    minVolume: 5000,
    limit: 6,
  });
  expect(value[0]).toMatchObject({
    phrase: "cipher",
    metrics: { searchVolume: 49500 },
  });
});

it("fetches the keywords a site ranks for, with its page and position", async () => {
  const { calls, provider: p } = provider({ [RANKED]: labsRanked });
  const { value } = await p.rankedKeywords!("cipherdecipher.com", market, {
    minVolume: 100,
    limit: 5,
  });
  expect(value[2]).toMatchObject({
    phrase: "cipher decoder",
    rank: 17,
    url: "https://www.cipherdecipher.com/",
    metrics: { searchVolume: 14800 },
  });
  expect(calls[0].body).toMatchObject([
    {
      target: "cipherdecipher.com",
      filters: ["keyword_data.keyword_info.search_volume", ">=", 100],
    },
  ]);
});

it("estimates each site's monthly organic visits", async () => {
  const { calls, provider: p } = provider({ [TRAFFIC]: labsTraffic });
  const { value } = await p.siteTraffic!(
    ["cryptii.com", "cipherdecipher.com", "reddit.com"],
    market,
  );
  expect(Math.round(value.get("cryptii.com")!)).toBe(131843);
  expect(Math.round(value.get("cipherdecipher.com")!)).toBe(419);
  expect(calls[0].body).toMatchObject([{ item_types: ["organic"] }]);
});

it("reads 5 years of weekly search interest and leaves out weeks without data", async () => {
  const { calls, provider: p } = provider({ [TREND]: trendsCipherDecoder });
  const { value } = await p.searchTrend!("cipher decoder", market);
  // 261 weeks; the current week is marked missing_data.
  expect(value).toHaveLength(260);
  expect(value[0]).toEqual({ week: "2021-10-31", value: 29 });
  expect(calls[0].body).toEqual([
    {
      keywords: ["cipher decoder"],
      location_code: 2840,
      time_range: "past_5_years",
      type: "web",
    },
  ]);
});

it("compares search interest with a reference word, a null value as 0", async () => {
  const { calls, provider: p } = provider({ [TREND]: trendsVsGpts });
  const { value } = await p.trendCompare!(
    ["ragdoll robot boxing", "gpts"],
    market,
    "past_7_days",
  );
  // 169 hours; the last one is partial and marked missing.
  expect(value).toHaveLength(168);
  expect(
    value.find((p) => p.at === "2026-10-31T04:00:00.000Z")?.values,
  ).toEqual([72, 50]);
  expect(
    value.find((p) => p.at === "2026-10-31T06:00:00.000Z")?.values,
  ).toEqual([56, 0]);
  expect(calls[0].body).toEqual([
    {
      keywords: ["ragdoll robot boxing", "gpts"],
      location_code: 2840,
      time_range: "past_7_days",
      type: "web",
    },
  ]);
});

it("reads the queries rising under a root word", async () => {
  const { calls, provider: p } = provider({ [TREND]: trendsRisingAi });
  const { value } = await p.risingQueries!("ai", market);
  expect(value[3]).toEqual({
    query: "ai impacts theoretical computer science",
    value: 13950,
  });
  expect(calls[0].body).toMatchObject([
    { keywords: ["ai"], item_types: ["google_trends_queries_list"] },
  ]);
});

it("asks for 20 results when told to", async () => {
  const { calls, provider: p } = provider({
    [SERP]: { result: [{ items: [] }] },
  });
  await p.serp("x", market, 20);
  expect(calls[0].body).toMatchObject([{ depth: 20 }]);
});
