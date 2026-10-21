import { desc, eq, inArray } from "drizzle-orm";

import type { Database } from "@repo/db/client";
import {
  keywordMetricSnapshots,
  keywords,
  opportunities,
  opportunityEvaluations,
  serpResults,
  serpSnapshots,
  sourceSignals,
} from "@repo/db/schema";
import { logger } from "@repo/observability/logger";

import type { Budget } from "./budget";
import { buildAdvice } from "./build-advice";
import {
  analysisKeywords,
  clusterEvidence,
  offTopicShare,
  type ClusterMember,
} from "./cluster-evidence";
import { classifyIntent } from "./intent";
import { analysisSchema, type OpportunityAnalyst } from "./opportunity-analyst";
import {
  confidence,
  needsReview,
  SCORING_VERSION,
  scoreDimensions,
  totalScore,
  type ClusterEvidence,
} from "./scoring";
import { clusterSerpKeyword, serpCompetition } from "./serp-competition";

/** Source titles the analysis sees per cluster. */
const MAX_SOURCE_TITLES = 5;
/** At most this many opportunities per run (docs/product/product.md#f05-产品机会). */
export const TOP_OPPORTUNITIES = 5;

type Cluster = {
  name: string;
  keywordIds: string[];
  members: ClusterMember[];
  signals: ClusterEvidence["signals"];
  serpSnapshotIds: string[];
  serpTitles: string[];
  signalIds: string[];
  sourceTitles: string[];
};

// Rule-based clustering v1: one cluster per seed, with the keywords expanded from it and
// the signals observing any of its phrases (radar signals observe all of them).
async function clusters(database: Database, projectId: string) {
  const rows = await database
    .select()
    .from(keywords)
    .where(eq(keywords.projectId, projectId));
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
  const metrics = await database
    .select()
    .from(keywordMetricSnapshots)
    .where(inArray(keywordMetricSnapshots.keywordId, ids))
    .orderBy(
      desc(keywordMetricSnapshots.fetchedAt),
      desc(keywordMetricSnapshots.id),
    );
  const latest = new Map<string, (typeof metrics)[number]>();
  for (const m of metrics)
    if (!latest.has(m.keywordId)) latest.set(m.keywordId, m);
  const snapshots = await database
    .select()
    .from(serpSnapshots)
    .where(inArray(serpSnapshots.keywordId, ids))
    .orderBy(desc(serpSnapshots.fetchedAt), desc(serpSnapshots.id));
  const newestSerp = new Map<string, (typeof snapshots)[number]>();
  for (const s of snapshots)
    if (!newestSerp.has(s.keywordId)) newestSerp.set(s.keywordId, s);
  const titles =
    newestSerp.size === 0
      ? []
      : await database
          .select()
          .from(serpResults)
          .where(
            inArray(
              serpResults.snapshotId,
              [...newestSerp.values()].map((s) => s.id),
            ),
          )
          .orderBy(serpResults.rank);
  const signals = await database
    .select()
    .from(sourceSignals)
    .where(eq(sourceSignals.projectId, projectId));

  const bySeed = new Map<string, typeof rows>();
  for (const row of rows)
    bySeed.set(row.seed, [...(bySeed.get(row.seed) ?? []), row]);
  return [...bySeed.entries()].map(([seed, members]): Cluster => {
    const phrases = new Set(members.map((m) => m.phrase));
    // A radar item the project started from observes every seed: the seeds may be
    // phrases shortened from its title. Imported rows observe their own term.
    const clusterSignals = signals.filter(
      (s) => s.provider !== "csv" || phrases.has(s.normalizedTerm),
    );
    const scored = members.map((m): ClusterMember => {
      const metric = latest.get(m.id);
      const snapshot = newestSerp.get(m.id);
      return {
        id: m.id,
        phrase: m.phrase,
        searchVolume: metric?.searchVolume ?? null,
        cpcUsd: metric?.cpcMicros == null ? null : metric.cpcMicros / 1_000_000,
        keywordDifficulty: metric?.keywordDifficulty ?? null,
        fetchedAt: metric?.fetchedAt ?? null,
        serp: snapshot
          ? serpCompetition(
              m.phrase,
              titles.filter((t) => t.snapshotId === snapshot.id),
            )
          : null,
      };
    });
    const audited = members.flatMap((m) => {
      const snapshot = newestSerp.get(m.id);
      return snapshot ? [snapshot] : [];
    });
    const representative = clusterSerpKeyword(
      seed,
      scored,
      new Set(scored.filter((m) => m.serp).map((m) => m.id)),
    );
    const representativeSnapshot =
      representative && newestSerp.get(representative.id)!;
    return {
      name: seed,
      keywordIds: members.map((m) => m.id),
      members: scored,
      signals: clusterSignals.map((s) => ({
        observedAt: s.observedAt,
        source: s.metadata.source ?? null,
      })),
      serpSnapshotIds: audited.map((s) => s.id),
      // The analysis sees the results the first score's competition rests on.
      serpTitles: titles
        .filter((t) => t.snapshotId === representativeSnapshot?.id)
        .map((t) => t.title),
      signalIds: clusterSignals.map((s) => s.id),
      sourceTitles: [
        ...new Set(
          clusterSignals
            .filter((s) => s.provider !== "csv")
            .map((s) => s.rawTitle),
        ),
      ].slice(0, MAX_SOURCE_TITLES),
    };
  });
}

/** Score, confidence and the rest of an evaluation, from the evidence left on topic. */
function evaluation(
  cluster: Cluster,
  offTopic: ReadonlySet<string>,
  now: Date,
) {
  const evidence = clusterEvidence(
    cluster.name,
    cluster.members,
    cluster.signals,
    offTopic,
  );
  const dimensions = scoreDimensions(evidence);
  const score = totalScore(dimensions);
  const conf = confidence(evidence, now);
  return {
    dimensions,
    score,
    confidence: conf,
    needsReview: needsReview(
      score,
      conf,
      offTopicShare(offTopic, cluster.members),
    ),
    serpCompetition: evidence.serp ?? null,
    buildAdvice: buildAdvice(evidence),
  };
}

type Scored = { cluster: Cluster } & ReturnType<typeof evaluation>;

const best = (a: Scored, b: Scored) =>
  b.score - a.score ||
  b.confidence - a.confidence ||
  a.cluster.name.localeCompare(b.cluster.name);

/**
 * Clusters, scores and ranks a project's keywords, keeps the top opportunities and asks
 * the analyst for their hypotheses. Clusters without any search volume are left out:
 * fewer than five opportunities is fine when the evidence is thin.
 */
export async function evaluateOpportunities(deps: {
  database: Database;
  analyst: OpportunityAnalyst;
  budget: Budget;
  now: () => Date;
  projectId: string;
  runId: string;
  /** False once the run was cancelled: no more paid analyses. */
  isActive?: () => Promise<boolean>;
}) {
  const { database, analyst, budget, now, projectId, runId } = deps;
  let budgetExhausted = false;
  // The analysis marks the off-topic keywords, so the first score picks the top
  // clusters and the score without those keywords ranks them.
  const top = (await clusters(database, projectId))
    .filter((c) => c.members.some((m) => m.searchVolume !== null))
    .map((c): Scored => ({ cluster: c, ...evaluation(c, new Set(), now()) }))
    .sort(best)
    .slice(0, TOP_OPPORTUNITIES);

  const analyzed: (Scored & {
    analysis: Record<string, unknown> | null;
    analysisError: string | null;
  })[] = [];
  for (const { cluster } of top) {
    if (deps.isActive && !(await deps.isActive())) break;
    let analysis: Record<string, unknown> | null = null;
    let analysisError: string | null = null;
    let offTopic = new Set<string>();
    try {
      // Without AI budget the score still stands; the analysis says why it is missing.
      const charged = await budget.charge(
        {
          projectId,
          runId,
          kind: "ai",
          provider: analyst.name,
          operation: "analyze",
          maxCostMicros: analyst.maxCostMicros,
        },
        () =>
          analyst.analyze({
            cluster: cluster.name,
            keywords: analysisKeywords(cluster.members).map((k) => ({
              phrase: k.phrase,
              searchVolume: k.searchVolume,
              intent: classifyIntent(k.phrase),
            })),
            serpTitles: cluster.serpTitles,
            signalSources: [
              ...new Set(
                cluster.signals.flatMap((s) => (s.source ? [s.source] : [])),
              ),
            ],
            sourceTitles: cluster.sourceTitles,
          }),
      );
      if (!charged) {
        budgetExhausted = true;
        analysisError = "BUDGET_EXHAUSTED";
      } else {
        const parsed = analysisSchema.safeParse(charged.value);
        // Only the cluster's own keywords can be off topic.
        const phrases = new Set(cluster.members.map((k) => k.phrase));
        if (parsed.success) {
          const marked = parsed.data.offTopicKeywords.filter((p) =>
            phrases.has(p.trim().toLowerCase()),
          );
          offTopic = new Set(marked.map((p) => p.trim().toLowerCase()));
          analysis = { ...parsed.data, offTopicKeywords: marked };
        } else analysisError = "AI_INVALID_OUTPUT";
      }
    } catch (error) {
      analysisError = "AI_ERROR";
      logger.warn("research.analysis_failed", { runId, error });
    }
    analyzed.push({
      cluster,
      ...evaluation(cluster, offTopic, now()),
      analysis,
      analysisError,
    });
  }

  for (const [index, item] of analyzed.sort(best).entries()) {
    const { cluster } = item;
    await database.transaction(async (tx) => {
      const [opportunity] = await tx
        .insert(opportunities)
        .values({ projectId, cluster: cluster.name })
        .onConflictDoUpdate({
          target: [opportunities.projectId, opportunities.cluster],
          set: { updatedAt: now() },
        })
        .returning({ id: opportunities.id });
      await tx.insert(opportunityEvaluations).values({
        opportunityId: opportunity.id,
        runId,
        scoringVersion: SCORING_VERSION,
        score: item.score,
        dimensions: item.dimensions,
        confidence: item.confidence,
        needsReview: item.needsReview,
        rank: index + 1,
        analysis: item.analysis,
        analysisError: item.analysisError,
        analystProvider: analyst.name,
        analystModel: analyst.model,
        serpCompetition: item.serpCompetition,
        buildAdvice: item.buildAdvice,
        analystPromptVersion: analyst.promptVersion,
        evidence: {
          keywordIds: cluster.keywordIds,
          serpSnapshotIds: cluster.serpSnapshotIds,
          signalIds: cluster.signalIds,
        },
      });
    });
  }
  return { evaluated: analyzed.length, budgetExhausted };
}
