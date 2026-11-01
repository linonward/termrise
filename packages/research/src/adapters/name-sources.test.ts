import { describe, expect, it } from "vitest";

import {
  createHuggingFaceNames,
  createItchNames,
  createProductHuntNames,
  createShowHnNames,
  gamePhrase,
  modelPhrase,
  rankHeat,
  showHnName,
} from "./name-sources";

describe("modelPhrase", () => {
  it("keeps the name people search for, without sizes and packing", () => {
    expect(modelPhrase("deepseek-ai/DeepSeek-V4.1-Flash-1017")).toBe(
      "deepseek v4.1 flash 1017",
    );
    expect(modelPhrase("LiquidAI/LFM3-1.7B")).toBe("liquid lfm3");
    expect(modelPhrase("Nanbeige/Nanbeige4.3-33B")).toBe("nanbeige4.3");
    expect(modelPhrase("mistralai/Mistral-Large-4-1T-A52B")).toBe(
      "mistral large 4",
    );
    expect(modelPhrase("Lightricks/LTX-2.5")).toBe("ltx 2.5");
    expect(modelPhrase("Qwen/Qwen3.8-27B")).toBe("qwen3.8");
  });

  it("skips third-party copies of a model", () => {
    expect(
      modelPhrase("ISTA-DASLab/DeepSeek-V4.1-Flash-1017-GSQ-RCO-GGUF"),
    ).toBeNull();
    expect(
      modelPhrase("abenzerps/Qwen-Image-2.1-Uncensored-Quantized"),
    ).toBeNull();
  });
});

describe("gamePhrase", () => {
  it("drops quotes, emoji and tags", () => {
    expect(gamePhrase("&quot;Voices Of The Void&quot; Alpha")).toBe(
      "voices of the void alpha",
    );
    expect(gamePhrase("Hot Wax 🔥")).toBe("hot wax");
    expect(gamePhrase("Neo Forge: MTG Commander vs AI")).toBe(
      "neo forge: mtg commander vs ai",
    );
    expect(gamePhrase("??")).toBeNull();
  });
});

describe("name sources", () => {
  it("reads trending models from Hugging Face", async () => {
    const seen: string[] = [];
    const hf = createHuggingFaceNames({
      fetch: (async (url: string) => {
        seen.push(url);
        return Response.json([
          { id: "LiquidAI/LFM3-1.7B", createdAt: "2026-10-28T01:00:00.000Z" },
          {
            id: "LiquidAI/LFM3-1.7B-GGUF",
            createdAt: "2026-10-29T01:00:00.000Z",
          },
          { id: "Qwen/Qwen3.8-27B" },
          { id: "Qwen/Qwen3.8-27B-Instruct" },
        ]);
      }) as unknown as typeof fetch,
    });
    // The trending rank is the heat; the creation time says how new it is.
    expect(await hf.names(5)).toEqual([
      { name: "liquid lfm3", heat: 3, releasedAt: "2026-10-28T01:00:00.000Z" },
      { name: "qwen3.8", heat: 2, releasedAt: null },
    ]);
    expect(seen[0]).toContain("sort=trendingScore");
  });

  it("reads new games from itch.io", async () => {
    const itch = createItchNames({
      fetch: (async () =>
        new Response(
          "<rss><item><plainTitle>Soulash 2</plainTitle><pubDate>Wed, 29 Oct 2026 10:00:00 GMT</pubDate></item><item><plainTitle>NASUBI</plainTitle></item></rss>",
        )) as unknown as typeof fetch,
    });
    expect(await itch.names(10)).toEqual([
      { name: "soulash 2", heat: 3, releasedAt: "2026-10-29T10:00:00.000Z" },
      { name: "nasubi", heat: 2, releasedAt: null },
    ]);
  });

  it("reads the names of Show HN launches, the best scored first", async () => {
    const seen: string[] = [];
    const hn = createShowHnNames({
      now: () => new Date("2026-11-01T00:00:00Z"),
      fetch: (async (url: string) => {
        seen.push(url);
        return Response.json({
          hits: [
            {
              title: "Show HN: I built a tool for my taxes",
              points: 400,
              created_at: "2026-10-31T00:00:00Z",
            },
            {
              title: "Show HN: Lumo Edit – edit photos with one prompt",
              points: 40,
              created_at: "2026-10-31T01:00:00Z",
            },
            {
              title: "Show HN: Proxenos.ai - a local-first agent",
              points: 150,
              created_at: "2026-10-30T00:00:00Z",
            },
          ],
        });
      }) as unknown as typeof fetch,
    });
    expect(await hn.names(10)).toEqual([
      { name: "proxenos", heat: 3, releasedAt: "2026-10-30T00:00:00Z" },
      { name: "lumo edit", heat: 2, releasedAt: "2026-10-31T01:00:00Z" },
    ]);
    expect(seen[0]).toContain("tags=show_hn");
    expect(seen[0]).toContain("points%3E%3D10");
  });
});

describe("Product Hunt", () => {
  it("reads the last days' launches by votes, with the token", async () => {
    const seen: { url: string; init: RequestInit }[] = [];
    const ph = createProductHuntNames({
      token: "test-token",
      now: () => new Date("2026-11-01T00:00:00Z"),
      fetch: (async (url: string, init: RequestInit) => {
        seen.push({ url, init });
        return Response.json({
          data: {
            posts: {
              edges: [
                {
                  node: {
                    name: "Lumo Edit",
                    votesCount: 420,
                    createdAt: "2026-10-31T07:00:00Z",
                    featuredAt: "2026-10-31T08:00:00Z",
                  },
                },
                {
                  node: {
                    name: "Tally.so",
                    votesCount: 150,
                    createdAt: "2026-10-30T07:00:00Z",
                    featuredAt: null,
                  },
                },
                {
                  node: {
                    name: "The best way to plan your week",
                    votesCount: 90,
                    createdAt: "2026-10-30T07:00:00Z",
                    featuredAt: null,
                  },
                },
              ],
            },
          },
        });
      }) as unknown as typeof fetch,
    });
    expect(await ph.names(10)).toEqual([
      { name: "lumo edit", heat: 3, releasedAt: "2026-10-31T08:00:00Z" },
      { name: "tally", heat: 2, releasedAt: "2026-10-30T07:00:00Z" },
    ]);
    expect(seen[0].url).toBe("https://api.producthunt.com/v2/api/graphql");
    expect(new Headers(seen[0].init.headers).get("authorization")).toBe(
      "Bearer test-token",
    );
    expect(String(seen[0].init.body)).toContain("2026-10-29T00:00:00.000Z");
  });
});

describe("showHnName", () => {
  it("takes the product's name before the dash, not a sentence", () => {
    expect(showHnName("Show HN: Lumo Edit – edit photos")).toBe("lumo edit");
    expect(showHnName("Show HN: Cursedcam.com: a cursed camera")).toBe(
      "cursedcam",
    );
    expect(showHnName("Show HN: I made a game in a week")).toBeNull();
    expect(showHnName("Show HN: A faster way to read papers")).toBeNull();
    expect(showHnName("Show HN: My weekend project")).toBeNull();
  });
});

describe("rankHeat", () => {
  it("gives the top third 3, the middle 2 and the rest 1", () => {
    expect([0, 1, 2, 3, 4, 5].map((i) => rankHeat(i, 6))).toEqual([
      3, 3, 2, 2, 1, 1,
    ]);
  });
});
