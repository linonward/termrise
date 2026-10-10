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

export type KeywordIdea = { phrase: string; metrics: KeywordMetrics };

export type SerpItem = {
  rank: number;
  url: string;
  title: string;
  type: string;
};

/** A call's result and what the provider charged for it, in micro-USD. */
export type Charged<T> = { value: T; costMicros: number };

export interface KeywordProvider {
  name: "fake";
  /** The most one call can cost, reserved from the data budget before it (budget.ts). */
  maxCostMicros: { expand: number; serp: number };
  /** Ideas for one seed, the seed itself included, with their metrics. */
  expand(seed: string, market: Market): Promise<Charged<KeywordIdea[]>>;
  /** The top 10 organic results on desktop. */
  serp(phrase: string, market: Market): Promise<Charged<SerpItem[]>>;
}
