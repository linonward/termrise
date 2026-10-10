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

export interface KeywordProvider {
  name: "fake";
  /** Ideas for one seed, the seed itself included, with their metrics. */
  expand(seed: string, market: Market): Promise<KeywordIdea[]>;
  /** The top 10 organic results on desktop. */
  serp(phrase: string, market: Market): Promise<SerpItem[]>;
}
