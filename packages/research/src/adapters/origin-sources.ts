// Free sources that show where a rising word came from (docs/product/keyword-pool.md#origins):
// Hacker News stories (Algolia search), Hugging Face models and Spaces, GitHub repositories.
// Each returns a few items around the word's burst; a source that fails returns nothing.
import { z } from "zod";

export const ORIGIN_SOURCES = [
  "hacker_news",
  "hugging_face",
  "github",
] as const;
export type OriginSourceName = (typeof ORIGIN_SOURCES)[number];

export type OriginEvidence = {
  source: OriginSourceName;
  kind: "story" | "model" | "space" | "repo";
  title: string;
  url: string;
  /** When it was posted or created (ISO). */
  at: string;
  /** Points, likes or stars. */
  score: number | null;
  /** A short description, when the source has one. */
  note?: string;
};

export type OriginWindow = { from: Date; to: Date };

export interface OriginSource {
  name: OriginSourceName;
  search(phrase: string, window: OriginWindow): Promise<OriginEvidence[]>;
}

const USER_AGENT = "termrise-origins/1.0 (+https://termrise.com)";
const PER_SOURCE = 5;
const HN_ITEM = "https://news.ycombinator.com/item?id=";

type Deps = { fetch?: typeof fetch; baseUrl?: string };

async function getJson(fetcher: typeof fetch, url: string, headers = {}) {
  const res = await fetcher(url, {
    headers: { "user-agent": USER_AGENT, ...headers },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`${new URL(url).host} returned ${res.status}`);
  return res.json() as Promise<unknown>;
}

const seconds = (d: Date) => Math.floor(d.getTime() / 1000);
const day = (d: Date) => d.toISOString().slice(0, 10);
/** Hugging Face and GitHub names use dashes: "nano banana" is nano-banana. */
const slug = (phrase: string) => phrase.trim().replace(/\s+/g, "-");

const hnHits = z.object({
  hits: z.array(
    z.object({
      objectID: z.string(),
      title: z.string().nullish(),
      url: z.string().nullish(),
      points: z.number().nullish(),
      num_comments: z.number().nullish(),
      created_at_i: z.number(),
    }),
  ),
});

export function createHackerNewsOrigin(deps: Deps = {}): OriginSource {
  const fetcher = deps.fetch ?? fetch;
  const base = deps.baseUrl ?? "https://hn.algolia.com/api/v1";
  return {
    name: "hacker_news",
    async search(phrase, { from, to }) {
      const query = new URLSearchParams({
        query: `"${phrase}"`,
        tags: "story",
        numericFilters: `created_at_i>${seconds(from)},created_at_i<${seconds(to)}`,
        hitsPerPage: String(PER_SOURCE),
      });
      const { hits } = hnHits.parse(
        await getJson(fetcher, `${base}/search?${query}`),
      );
      return hits
        .filter((h) => h.title)
        .map((h) => ({
          source: "hacker_news" as const,
          kind: "story" as const,
          title: h.title!,
          url: h.url || `${HN_ITEM}${h.objectID}`,
          at: new Date(h.created_at_i * 1000).toISOString(),
          score: h.points ?? null,
          note: `${h.num_comments ?? 0} comments · ${HN_ITEM}${h.objectID}`,
        }));
    },
  };
}

const hfItems = z.array(
  z.object({
    id: z.string(),
    likes: z.number().nullish(),
    createdAt: z.string().nullish(),
    pipeline_tag: z.string().nullish(),
  }),
);

export function createHuggingFaceOrigin(deps: Deps = {}): OriginSource {
  const fetcher = deps.fetch ?? fetch;
  const base = deps.baseUrl ?? "https://huggingface.co";
  return {
    name: "hugging_face",
    async search(phrase, { to }) {
      const out: OriginEvidence[] = [];
      for (const kind of ["models", "spaces"] as const) {
        const query = new URLSearchParams({
          search: slug(phrase),
          sort: "likes",
          limit: String(PER_SOURCE),
        });
        const items = hfItems.parse(
          await getJson(fetcher, `${base}/api/${kind}?${query}`),
        );
        for (const i of items) {
          // A model made after the burst did not start it.
          if (!i.createdAt || new Date(i.createdAt) > to) continue;
          out.push({
            source: "hugging_face",
            kind: kind === "models" ? "model" : "space",
            title: i.id,
            url: `${base}/${kind === "models" ? "" : "spaces/"}${i.id}`,
            at: new Date(i.createdAt).toISOString(),
            score: i.likes ?? null,
            ...(i.pipeline_tag ? { note: i.pipeline_tag } : {}),
          });
        }
      }
      return out;
    },
  };
}

const ghRepos = z.object({
  items: z.array(
    z.object({
      full_name: z.string(),
      html_url: z.string(),
      description: z.string().nullish(),
      stargazers_count: z.number(),
      created_at: z.string(),
    }),
  ),
});

export function createGitHubOrigin(
  deps: Deps & { token?: string } = {},
): OriginSource {
  const fetcher = deps.fetch ?? fetch;
  const base = deps.baseUrl ?? "https://api.github.com";
  return {
    name: "github",
    async search(phrase, { from, to }) {
      const query = new URLSearchParams({
        q: `"${phrase}" in:name,description created:${day(from)}..${day(to)}`,
        sort: "stars",
        order: "desc",
        per_page: String(PER_SOURCE),
      });
      const { items } = ghRepos.parse(
        await getJson(fetcher, `${base}/search/repositories?${query}`, {
          accept: "application/vnd.github+json",
          ...(deps.token ? { authorization: `Bearer ${deps.token}` } : {}),
        }),
      );
      return items.map((r) => ({
        source: "github" as const,
        kind: "repo" as const,
        title: r.full_name,
        url: r.html_url,
        at: new Date(r.created_at).toISOString(),
        score: r.stargazers_count,
        ...(r.description ? { note: r.description.slice(0, 200) } : {}),
      }));
    },
  };
}
