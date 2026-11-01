// Free lists of new names (docs/product/keyword-pool.md#name-sources): trending models on
// Hugging Face, new games on itch.io, Show HN launches and Trending Now. A name often
// becomes a search a few days later; each one goes to the new words' screen like a rising
// query. Each name comes with its heat on the source and when it was released, so the
// screen measures the hottest and newest first (S75).
import { z } from "zod";

export const NAME_SOURCES = [
  "hugging_face",
  "itch_io",
  "trending_now",
  "show_hn",
  "product_hunt",
] as const;
export type NameSourceName = (typeof NAME_SOURCES)[number];

export type NameItem = {
  /** A search phrase, lower case. */
  name: string;
  /** Heat on the source: 3 for the top, 1 for the rest. */
  heat: 1 | 2 | 3;
  /** When the thing was released or posted (ISO); null when the source does not say. */
  releasedAt: string | null;
};

export interface NameSource {
  name: NameSourceName;
  /** The newest names, at most `limit`, hottest first. */
  names(limit: number): Promise<NameItem[]>;
}

/** Heat from a rank in a list of `total`: the top third 3, the middle third 2, the rest 1. */
export function rankHeat(index: number, total: number): 1 | 2 | 3 {
  if (index < total / 3) return 3;
  if (index < (2 * total) / 3) return 2;
  return 1;
}

/** Unique names in list order, rated by their rank among the kept ones. */
function ranked(
  items: { name: string | null; releasedAt: string | null }[],
  limit: number,
): NameItem[] {
  const seen = new Set<string>();
  const kept: { name: string; releasedAt: string | null }[] = [];
  for (const i of items) {
    if (!i.name || seen.has(i.name)) continue;
    seen.add(i.name);
    kept.push({ name: i.name, releasedAt: i.releasedAt });
    if (kept.length === limit) break;
  }
  return kept.map((k, i) => ({ ...k, heat: rankHeat(i, kept.length) }));
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

// Openings of a sentence, not a product's name: "I built", "A faster way", "My project".
const SENTENCE =
  /^(i|i'm|i've|we|we're|my|our|a|an|the|this|how|why|what|open source|built|made|show)\b/i;
const TLD = /\.(com|ai|app|dev|io|so|co|sh|xyz|net|org|me|gg|tools?)$/i;

/** "Show HN: Lumo Edit – edit photos" → "lumo edit"; a sentence → null. */
export function showHnName(title: string): string | null {
  const head = title
    .replace(/^show hn:\s*/i, "")
    .split(/\s+[–—-]\s+|:\s|,\s|\s\(/)[0]
    .trim()
    .replace(TLD, "");
  if (!head || SENTENCE.test(head)) return null;
  const words = head.split(/\s+/);
  if (words.length > 4 || head.length > 40) return null;
  return head.toLowerCase();
}

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
        .array(z.object({ id: z.string(), createdAt: z.string().optional() }))
        .parse(await res.json());
      return ranked(
        models.map((m) => ({
          name: modelPhrase(m.id),
          releasedAt: m.createdAt ?? null,
        })),
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
      const games = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => {
        const title = /<plainTitle>([^<]*)<\/plainTitle>/.exec(m[1])?.[1];
        const date = /<pubDate>([^<]*)<\/pubDate>/.exec(m[1])?.[1];
        const at = date ? new Date(date) : null;
        return {
          name: title ? gamePhrase(title) : null,
          releasedAt:
            at && !Number.isNaN(at.getTime()) ? at.toISOString() : null,
        };
      });
      return ranked(games, limit);
    },
  };
}

/** Show HN points for each heat: a launch below MIN_POINTS is not read. */
const SHOW_HN_MIN_POINTS = 10;
const showHnHeat = (points: number): 1 | 2 | 3 =>
  points >= 100 ? 3 : points >= 30 ? 2 : 1;

/** Launches on Show HN in the last 3 days, by Algolia's free Hacker News search. */
export function createShowHnNames(
  deps: { fetch?: typeof fetch; baseUrl?: string; now?: () => Date } = {},
): NameSource {
  const fetcher = deps.fetch ?? fetch;
  const base = deps.baseUrl ?? "https://hn.algolia.com/api/v1";
  const now = deps.now ?? (() => new Date());
  return {
    name: "show_hn",
    async names(limit) {
      const since = Math.floor(now().getTime() / 1000) - 3 * 86_400;
      const query = new URLSearchParams({
        tags: "show_hn",
        numericFilters: `created_at_i>${since},points>=${SHOW_HN_MIN_POINTS}`,
        hitsPerPage: "100",
      });
      const res = await fetcher(`${base}/search_by_date?${query}`, {
        headers: { "user-agent": USER_AGENT },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`hn.algolia.com returned ${res.status}`);
      const { hits } = z
        .object({
          hits: z.array(
            z.object({
              title: z.string().nullable().catch(null),
              points: z.number().nullable().catch(null),
              created_at: z.string().nullable().catch(null),
            }),
          ),
        })
        .parse(await res.json());
      const seen = new Set<string>();
      return hits
        .toSorted((a, b) => (b.points ?? 0) - (a.points ?? 0))
        .flatMap((h) => {
          const name = h.title ? showHnName(h.title) : null;
          if (!name || seen.has(name)) return [];
          seen.add(name);
          return [
            {
              name,
              heat: showHnHeat(h.points ?? 0),
              releasedAt: h.created_at,
            },
          ];
        })
        .slice(0, limit);
    },
  };
}

const productHuntHeat = (votes: number): 1 | 2 | 3 =>
  votes >= 300 ? 3 : votes >= 100 ? 2 : 1;

const PRODUCT_HUNT_QUERY = `query Posts($after: DateTime!) {
  posts(order: VOTES, postedAfter: $after, first: 50) {
    edges { node { name votesCount createdAt featuredAt } }
  }
}`;

/** The last 3 days' launches on Product Hunt, most voted first (its GraphQL API, a token). */
export function createProductHuntNames(deps: {
  token: string;
  fetch?: typeof fetch;
  now?: () => Date;
}): NameSource {
  const fetcher = deps.fetch ?? fetch;
  const now = deps.now ?? (() => new Date());
  return {
    name: "product_hunt",
    async names(limit) {
      const after = new Date(now().getTime() - 3 * 86_400_000).toISOString();
      const res = await fetcher("https://api.producthunt.com/v2/api/graphql", {
        method: "POST",
        headers: {
          authorization: `Bearer ${deps.token}`,
          "content-type": "application/json",
          accept: "application/json",
          "user-agent": USER_AGENT,
        },
        body: JSON.stringify({
          query: PRODUCT_HUNT_QUERY,
          variables: { after },
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`producthunt.com returned ${res.status}`);
      const body = z
        .object({
          data: z.object({
            posts: z.object({
              edges: z.array(
                z.object({
                  node: z.object({
                    name: z.string(),
                    votesCount: z.number().catch(0),
                    createdAt: z.string().nullable().catch(null),
                    featuredAt: z.string().nullable().catch(null),
                  }),
                }),
              ),
            }),
          }),
        })
        .parse(await res.json());
      const seen = new Set<string>();
      return body.data.posts.edges
        .map((e) => e.node)
        .toSorted((a, b) => b.votesCount - a.votesCount)
        .flatMap((p) => {
          // A product's name, read like a Show HN title: a sentence is not a name.
          const name = showHnName(p.name);
          if (!name || seen.has(name)) return [];
          seen.add(name);
          return [
            {
              name,
              heat: productHuntHeat(p.votesCount),
              releasedAt: p.featuredAt ?? p.createdAt,
            },
          ];
        })
        .slice(0, limit);
    },
  };
}
