import { describe, expect, it } from "vitest";

import {
  createHuggingFaceNames,
  createItchNames,
  gamePhrase,
  modelPhrase,
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
          { id: "LiquidAI/LFM3-1.7B" },
          { id: "LiquidAI/LFM3-1.7B-GGUF" },
          { id: "Qwen/Qwen3.8-27B" },
          { id: "Qwen/Qwen3.8-27B-Instruct" },
        ]);
      }) as unknown as typeof fetch,
    });
    expect(await hf.names(5)).toEqual(["liquid lfm3", "qwen3.8"]);
    expect(seen[0]).toContain("sort=trendingScore");
  });

  it("reads new games from itch.io", async () => {
    const itch = createItchNames({
      fetch: (async () =>
        new Response(
          "<rss><item><plainTitle>Soulash 2</plainTitle></item><item><plainTitle>NASUBI</plainTitle></item></rss>",
        )) as unknown as typeof fetch,
    });
    expect(await itch.names(10)).toEqual(["soulash 2", "nasubi"]);
  });
});
