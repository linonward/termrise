// Free lists of new names (docs/product/keyword-pool.md#name-sources): trending models on
// Hugging Face and new games on itch.io. A name often becomes a search a few days later;
// each one goes to the new words' screen like a rising query.
import { z } from "zod";

export const NAME_SOURCES = [
  "hugging_face",
  "itch_io",
  "trending_now",
] as const;
export type NameSourceName = (typeof NAME_SOURCES)[number];

export interface NameSource {
  name: NameSourceName;
  /** Search phrases made from the newest names, lower case, at most `limit`. */
  names(limit: number): Promise<string[]>;
}

const USER_AGENT = "termrise-names/1.0 (+https://termrise.com)";

// Parts of a model id that say how it was packed, not what it is.
const PACKING =
  /^(\d+(\.\d+)?[bmkt]|a\d+(\.\d+)?b|gguf|awq|gptq|fp8|fp16|bf16|int4|int8|mlx|onnx|exl2|instruct|chat|base|it|hf|comfy|preview|quantized|\d+bit)$/i;
// Third-party copies of someone else's model.
const DERIVATIVE =
  /gguf|quantiz|uncensored|abliterat|lora|merge|distill|-ft\b|finetune/i;

/** "LiquidAI/LFM3-1.7B" → "liquid lfm3"; "deepseek-ai/DeepSeek-V4.1-Flash-1017" → "deepseek v4.1 flash 1017". */
export function modelPhrase(id: string): string | null {
  if (DERIVATIVE.test(id)) return null;
  const [org = "", repo = id] = id.includes("/") ? id.split("/") : ["", id];
  const parts = repo
    .split(/[-_\s]+/)
    .filter((p) => p && !PACKING.test(p))
    .slice(0, 4);
  if (parts.length === 0) return null;
  let phrase = parts.join(" ").toLowerCase();
  // A short bare name says little on its own: add the maker, as people search it.
  const maker = org
    .toLowerCase()
    .replace(/[-_]?ai$/, "")
    .replace(/[-_]+/g, " ");
  if (
    parts.length === 1 &&
    phrase.length <= 6 &&
    maker &&
    !phrase.includes(maker)
  )
    phrase = `${maker} ${phrase}`;
  return phrase;
}

/** An itch.io title without quotes, emoji and bracketed tags. */
export function gamePhrase(title: string): string | null {
  const phrase = title
    .replace(/&quot;|&#39;|&amp;/g, (m) => (m === "&amp;" ? "&" : ""))
    .replace(/\[[^\]]*\]/g, "")
    .replace(/[^\p{L}\p{N}\s:'&.-]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return phrase.length >= 3 && phrase.length <= 60 ? phrase : null;
}

const unique = (xs: (string | null)[], limit: number) =>
  [...new Set(xs.filter((x): x is string => !!x))].slice(0, limit);

export function createHuggingFaceNames(
  deps: { fetch?: typeof fetch; baseUrl?: string } = {},
): NameSource {
  const fetcher = deps.fetch ?? fetch;
  const base = deps.baseUrl ?? "https://huggingface.co";
  return {
    name: "hugging_face",
    async names(limit) {
      const res = await fetcher(
        `${base}/api/models?sort=trendingScore&limit=${limit * 2}`,
        {
          headers: { "user-agent": USER_AGENT },
          signal: AbortSignal.timeout(15_000),
        },
      );
      if (!res.ok) throw new Error(`huggingface.co returned ${res.status}`);
      const models = z
        .array(z.object({ id: z.string() }))
        .parse(await res.json());
      return unique(
        models.map((m) => modelPhrase(m.id)),
        limit,
      );
    },
  };
}

export function createItchNames(
  deps: { fetch?: typeof fetch; url?: string } = {},
): NameSource {
  const fetcher = deps.fetch ?? fetch;
  const url = deps.url ?? "https://itch.io/games/new-and-popular.xml";
  return {
    name: "itch_io",
    async names(limit) {
      const res = await fetcher(url, {
        headers: { "user-agent": USER_AGENT },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`itch.io returned ${res.status}`);
      const xml = await res.text();
      const titles = [
        ...xml.matchAll(/<plainTitle>([^<]*)<\/plainTitle>/g),
      ].map((m) => m[1]);
      return unique(titles.map(gamePhrase), limit);
    },
  };
}
