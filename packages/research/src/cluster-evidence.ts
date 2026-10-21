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
