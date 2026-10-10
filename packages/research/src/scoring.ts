import { classifyIntent, hasToolIntent } from "./intent";
import type { SerpCompetition } from "./serp-competition";

// Opportunity Score v1 (docs/product/product.md#评分与状态): six dimensions of 0–5,
// weighted to 100. A ranking heuristic, not a probability of success. Deterministic:
// the same evidence gives the same score, and the version is stored with it.
// v2: more tool-intent words for MVP fit; competition also counts the pages made for the
// keyword in its top results (serp-competition.ts).
export const SCORING_VERSION = "v2";

export const WEIGHTS = {
  trend: 20,
  demand: 15,
  competition: 20,
  commercial: 25,
  mvp: 10,
  distribution: 10,
} as const;

export type Dimension = keyof typeof WEIGHTS;
export type Dimensions = Record<Dimension, number>;

export type ClusterEvidence = {
  keywords: {
    phrase: string;
    searchVolume: number | null;
    cpcUsd: number | null;
    keywordDifficulty: number | null;
    fetchedAt: Date | null;
  }[];
  /** Whether the strongest keyword's top results were audited. */
  serpAudited: boolean;
  /** The top results of the strongest audited keyword; absent when none was audited. */
  serp?: SerpCompetition | null;
  /** Observations of the cluster's terms (CSV, later Hacker News and Trends). */
  signals: { observedAt: Date | null; source: string | null }[];
};

const step = (value: number, limits: number[]) =>
  limits.filter((limit) => value >= limit).length;

/** Distinct observation days: a term seen on several days is more than a spike. */
function trend(signals: ClusterEvidence["signals"]) {
  const days = new Set(
    signals
      .filter((s) => s.observedAt)
      .map((s) => s.observedAt!.toISOString().slice(0, 10)),
  );
  return Math.min(5, step(days.size, [1, 2, 3, 5, 8]));
}

/** The strongest keyword's volume; synonyms are not added together. */
function demand(keywords: ClusterEvidence["keywords"]) {
  const volumes = keywords.flatMap((k) =>
    k.searchVolume === null ? [] : [k.searchVolume],
  );
  if (volumes.length === 0) return 0;
  return step(Math.max(...volumes), [1, 100, 500, 2000, 10000]);
}

/**
 * Lower difficulty of the strongest keyword with a KD is a bigger opening. Few pages made
 * for the keyword in its top results open it more (+1); many close it (−1). Without a
 * KD, those pages alone decide.
 */
function competition(
  keywords: ClusterEvidence["keywords"],
  serp: SerpCompetition | null | undefined,
) {
  const kd = kdScore(keywords);
  const dedicated = serp?.dedicatedPages;
  if (kd === null)
    return dedicated === undefined
      ? 0
      : dedicated <= 2
        ? 4
        : dedicated <= 5
          ? 3
          : dedicated <= 8
            ? 2
            : 1;
  if (dedicated === undefined) return kd;
  const adjust = dedicated <= 2 ? 1 : dedicated >= 7 ? -1 : 0;
  return Math.max(0, Math.min(5, kd + adjust));
}

function kdScore(keywords: ClusterEvidence["keywords"]) {
  const rated = keywords
    .filter((k) => k.keywordDifficulty !== null)
    .sort((a, b) => (b.searchVolume ?? -1) - (a.searchVolume ?? -1));
  if (rated.length === 0) return null;
  const kd = rated[0].keywordDifficulty!;
  return kd <= 10
    ? 5
    : kd <= 25
      ? 4
      : kd <= 40
        ? 3
        : kd <= 60
          ? 2
          : kd <= 80
            ? 1
            : 0;
}

/** Share of buying-intent phrases, plus what advertisers pay for a click. */
function commercial(keywords: ClusterEvidence["keywords"]) {
  if (keywords.length === 0) return 0;
  const buying = keywords.filter((k) => {
    const intent = classifyIntent(k.phrase);
    return intent === "commercial" || intent === "transactional";
  }).length;
  const share = step(buying / keywords.length, [0.25, 0.5, 0.75]);
  const cpcs = keywords.flatMap((k) => (k.cpcUsd === null ? [] : [k.cpcUsd]));
  const cpc = cpcs.length === 0 ? 0 : step(Math.max(...cpcs), [1, 3]);
  return Math.min(5, share + cpc);
}

/** Tool-intent phrases ask for something small one developer can ship. */
function mvp(keywords: ClusterEvidence["keywords"]) {
  if (keywords.length === 0) return 0;
  const tools = keywords.filter((k) => hasToolIntent(k.phrase)).length;
  return step(tools / keywords.length, [0.1, 0.2, 0.35, 0.5, 0.7]);
}

/** Places the term already shows up: each distinct source is a channel to reach people. */
function distribution(signals: ClusterEvidence["signals"]) {
  const sources = new Set(signals.map((s) => s.source ?? "csv"));
  return Math.min(
    5,
    signals.length === 0 ? 0 : 1 + step(sources.size, [2, 3, 4, 5]),
  );
}

export function scoreDimensions(evidence: ClusterEvidence): Dimensions {
  return {
    trend: trend(evidence.signals),
    demand: demand(evidence.keywords),
    competition: competition(evidence.keywords, evidence.serp),
    commercial: commercial(evidence.keywords),
    mvp: mvp(evidence.keywords),
    distribution: distribution(evidence.signals),
  };
}

export function totalScore(dimensions: Dimensions) {
  return Math.round(
    (Object.keys(WEIGHTS) as Dimension[]).reduce(
      (sum, key) => sum + (dimensions[key] / 5) * WEIGHTS[key],
      0,
    ),
  );
}

/**
 * Evidence Confidence, 0–100, independent of the score: complete metrics, an audited
 * SERP, fresh data and observed signals. A high score on weak evidence needs review.
 */
export function confidence(evidence: ClusterEvidence, now: Date) {
  const { keywords, signals } = evidence;
  if (keywords.length === 0) return 0;
  const complete =
    keywords.filter(
      (k) => k.searchVolume !== null && k.keywordDifficulty !== null,
    ).length / keywords.length;
  const monthAgo = now.getTime() - 30 * 24 * 60 * 60 * 1000;
  const fresh =
    keywords.filter((k) => k.fetchedAt && k.fetchedAt.getTime() >= monthAgo)
      .length / keywords.length;
  return Math.round(
    complete * 40 +
      (evidence.serpAudited ? 25 : 0) +
      fresh * 15 +
      (signals.length > 0 ? 20 : 0),
  );
}

export const NEEDS_REVIEW_SCORE = 60;
export const NEEDS_REVIEW_CONFIDENCE = 50;

export const needsReview = (score: number, conf: number) =>
  score >= NEEDS_REVIEW_SCORE && conf < NEEDS_REVIEW_CONFIDENCE;
