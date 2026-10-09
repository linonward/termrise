// Keyword matrix: keyword clusters, their scores and the page that serves each
// one (docs/product/ux.md#keyword-matrix). Each product keeps its own
// seo/matrix.json; the seo-keyword-matrix skill fills it and scores it (its
// scripts/), these checks keep it consistent with the site in pnpm test.
import { z } from "zod";

export const INTENTS = [
  "informational",
  "commercial",
  "transactional",
  "navigational",
] as const;

// The page types the site has, with the intents each one serves. Add a type
// here when the site gets a new kind of page (e.g. /compare/{competitor}).
export const PAGE_TYPES = {
  blog: {
    intents: ["informational", "commercial"],
    path: /^\/blog\/[a-z0-9]+(-[a-z0-9]+)*$/,
    pattern: "/blog/{slug}",
  },
  landing: {
    intents: ["transactional", "navigational"],
    path: /^\/$/,
    pattern: "/",
  },
  pricing: {
    intents: ["transactional", "commercial"],
    path: /^\/pricing$/,
    pattern: "/pricing",
  },
} as const satisfies Record<
  string,
  {
    intents: readonly (typeof INTENTS)[number][];
    path: RegExp;
    pattern: string;
  }
>;

const score = z.number().int().min(1).max(5);

const scoresSchema = z.object({
  business: score,
  intent: score,
  productFit: score,
  // Higher = easier to rank for.
  competition: score,
  demand: score,
});

const clusterSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  primary: z.string(),
  keywords: z.array(z.string()).min(1),
  intent: z.enum(INTENTS),
  scores: scoresSchema,
  page: z.object({
    type: z.enum(Object.keys(PAGE_TYPES) as [keyof typeof PAGE_TYPES]),
    path: z.string(),
  }),
  // candidate → planned (brief written) → published (page live); rejected
  // keeps the decision so the keywords are not clustered again.
  status: z.enum(["candidate", "planned", "published", "rejected"]),
  note: z.string().optional(),
});

const matrixSchema = z.object({ clusters: z.array(clusterSchema) });

export type Cluster = z.infer<typeof clusterSchema>;
export type Matrix = z.infer<typeof matrixSchema>;

export function parseMatrix(json: unknown): Matrix {
  return matrixSchema.parse(json);
}

// What the matrix is checked against: the keyword list (normalized on import), the site's public
// paths and the ids of the briefs in seo/briefs/.
export type Site = { keywords: string[]; pages: string[]; briefs: string[] };

export function validateMatrix(matrix: Matrix, site: Site): string[] {
  const errors: string[] = [];
  const keywords = new Set(site.keywords);
  const ids = new Set<string>();
  const keywordOwner = new Map<string, string>();
  const pathOwner = new Map<string, string>();
  for (const cluster of matrix.clusters) {
    const error = (message: string) => errors.push(`${cluster.id}: ${message}`);
    if (ids.has(cluster.id)) error("the id is used by another cluster");
    ids.add(cluster.id);
    if (!cluster.keywords.includes(cluster.primary))
      error(`primary "${cluster.primary}" is not one of its keywords`);
    for (const keyword of cluster.keywords) {
      if (!keywords.has(keyword))
        error(`keyword "${keyword}" is not in seo/keywords.csv`);
      const owner = keywordOwner.get(keyword);
      if (owner !== undefined && owner !== cluster.id)
        error(`keyword "${keyword}" is also in ${owner}`);
      else keywordOwner.set(keyword, cluster.id);
    }
    const { type, path } = cluster.page;
    const pageType = PAGE_TYPES[type];
    if (!(pageType.intents as readonly string[]).includes(cluster.intent))
      error(`${cluster.intent} intent does not fit a ${type} page`);
    if (!pageType.path.test(path))
      error(`a ${type} page must have the path ${pageType.pattern}`);
    if (cluster.status === "rejected") continue;
    // One URL serves one cluster, or the pages compete for the same searches.
    const pathTaken = pathOwner.get(path);
    if (pathTaken !== undefined)
      error(`${path} is also the page of ${pathTaken}`);
    else pathOwner.set(path, cluster.id);
    if (cluster.status !== "candidate" && !site.briefs.includes(cluster.id))
      error(`no brief at seo/briefs/${cluster.id}.md`);
    if (cluster.status === "published" && !site.pages.includes(path))
      error(`${path} is published but the site has no such page`);
  }
  return errors;
}
