// Port for keyword data (docs/architecture/termrise.md#外部-api): expansion with metrics,
// and the top organic results. Adapters map a provider's responses onto these shapes;
// a value the provider does not report is null, never 0.

export type Market = { locationCode: number; languageCode: string };

export type KeywordMetrics = {
  /** Average monthly searches. */
  searchVolume: number | null;
  /** Cost per click in micro-USD. */
  cpcMicros: number | null;
  /** Google Ads competition, 0–100; not the SEO difficulty. */
  adsCompetition: number | null;
  /** SEO keyword difficulty, 0–100. */
  keywordDifficulty: number | null;
};

export type KeywordIdea = {
  phrase: string;
  metrics: KeywordMetrics;
  /** Monthly searches for the last 12 months, oldest first, when the provider has them. */
  monthlySearches?: number[];
};

/** A keyword a site already ranks for, with the page and its position. */
export type RankedKeyword = KeywordIdea & { rank: number; url: string };

/** One week of a search-interest curve (0 to 100, relative to the curve's peak). */
export type TrendPoint = { week: string; value: number };

/** Which keywords to fetch: a search-volume band and how many at most. */
export type VolumeBand = {
  minVolume: number;
  maxVolume?: number;
  limit: number;
};

export type SerpItem = {
  rank: number;
  url: string;
  /** The site behind the result: a host such as example.com, or a name such as Reddit. */
  site: string;
  title: string;
  type: string;
};

/** A call's result and what the provider charged for it, in micro-USD. */
export type Charged<T> = { value: T; costMicros: number };

export interface KeywordProvider {
  name: "fake" | "dataforseo";
  /** The most one call can cost, reserved from the data budget before it (budget.ts). */
  maxCostMicros: {
    expand: number;
    serp: number;
    difficulty?: number;
    suggestions?: number;
    ranked?: number;
    traffic?: number;
    trend?: number;
  };
  /**
   * How long an answer may be reused instead of paid again (provider-cache.ts), per
   * operation. Without it nothing is cached.
   */
  cacheTtlMs?: {
    expand: number;
    serp: number;
    difficulty: number;
    suggestions?: number;
    ranked?: number;
    traffic?: number;
    trend?: number;
  };
  /** Ideas for one seed, the seed itself included, with their metrics. */
  expand(seed: string, market: Market): Promise<Charged<KeywordIdea[]>>;
  /**
   * SEO difficulty of phrases whose ideas came without it, in one call. Phrases with no
   * data are left out of the map. Only providers whose expand() lacks difficulty have it.
   */
  difficulty?(
    phrases: string[],
    market: Market,
  ): Promise<Charged<Map<string, number>>>;
  /** The top 10 organic results on desktop. */
  serp(phrase: string, market: Market): Promise<Charged<SerpItem[]>>;
  /**
   * Keywords that contain the seed, in a search-volume band, biggest first, with
   * difficulty and monthly searches. The seed itself is included when it is in the band.
   */
  suggestions?(
    seed: string,
    market: Market,
    band: VolumeBand,
  ): Promise<Charged<KeywordIdea[]>>;
  /** Keywords a site ranks for, biggest first. */
  rankedKeywords?(
    site: string,
    market: Market,
    band: VolumeBand,
  ): Promise<Charged<RankedKeyword[]>>;
  /** Estimated monthly organic visits per site; sites without data are left out. */
  siteTraffic?(
    sites: string[],
    market: Market,
  ): Promise<Charged<Map<string, number>>>;
  /** Weekly search interest for the past 5 years, oldest first; weeks without data are left out. */
  searchTrend?(phrase: string, market: Market): Promise<Charged<TrendPoint[]>>;
}
