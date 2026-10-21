import { MAX_OFF_TOPIC_KEYWORDS } from "./opportunity-analyst";
import type { ClusterEvidence } from "./scoring";
import { clusterSerpKeyword, type SerpCompetition } from "./serp-competition";

/** A cluster keyword with its latest metrics and the competition of its newest SERP. */
export type ClusterMember = ClusterEvidence["keywords"][number] & {
  id: string;
  serp: SerpCompetition | null;
};

/**
 * The evidence a cluster is scored on. Off-topic keywords (marked by the analysis) are
 * left out, so a word that means something else does not give the cluster its demand,
 * commercial intent or competition (scoring v4). They stay in the cluster's keywords.
 */
export function clusterEvidence(
  seed: string,
  members: readonly ClusterMember[],
  signals: ClusterEvidence["signals"],
  offTopic: ReadonlySet<string> = new Set(),
): ClusterEvidence {
  const kept = members.filter((m) => !offTopic.has(m.phrase));
  // The seed's own results stand for the cluster's competition when audited.
  const representative = clusterSerpKeyword(
    seed,
    kept,
    new Set(kept.filter((m) => m.serp).map((m) => m.id)),
  );
  return {
    keywords: kept.map((m) => ({
      phrase: m.phrase,
      searchVolume: m.searchVolume,
      cpcUsd: m.cpcUsd,
      keywordDifficulty: m.keywordDifficulty,
      fetchedAt: m.fetchedAt,
    })),
    serpAudited: kept.some((m) => m.serp),
    serp: representative?.serp ?? null,
    signals,
  };
}

/**
 * The keywords the analysis judges: the ones with the most searches, as many as it can
 * mark off topic. A longer list made the answer too long to be valid (S40).
 */
export function analysisKeywords<M extends { searchVolume: number | null }>(
  members: readonly M[],
) {
  return [...members]
    .sort((a, b) => (b.searchVolume ?? -1) - (a.searchVolume ?? -1))
    .slice(0, MAX_OFF_TOPIC_KEYWORDS);
}

/** Off-topic share among the keywords the analysis was asked about. */
export function offTopicShare(
  offTopic: ReadonlySet<string>,
  members: readonly ClusterMember[],
) {
  const asked = analysisKeywords(members).length;
  return asked === 0 ? 0 : offTopic.size / asked;
}

/**
 * The keywords left out of the score: the analysis's marks, then the owner's reviews,
 * which win. An owner who reviewed any keyword has checked the marks.
 */
export function offTopicMarks(
  analysis: readonly string[],
  reviews: readonly { phrase: string; offTopic: boolean }[],
) {
  const marks = new Set(analysis.map((p) => p.trim().toLowerCase()));
  for (const review of reviews)
    if (review.offTopic) marks.add(review.phrase);
    else marks.delete(review.phrase);
  return marks;
}
