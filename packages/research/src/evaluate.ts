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

/** At most this many opportunities per run (docs/product/product.md#f05-产品机会). */
export const TOP_OPPORTUNITIES = 5;

type Cluster = {
  name: string;
  keywordIds: string[];
  evidence: ClusterEvidence;
  serpSnapshotIds: string[];
  serpTitles: string[];
  signalIds: string[];
  intents: string[];
};

// Rule-based clustering v1: one cluster per seed, with the keywords expanded from it and
// the signals observing any of its phrases.
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
    const clusterSignals = signals.filter((s) => phrases.has(s.normalizedTerm));
    const audited = members.flatMap((m) => {
      const snapshot = newestSerp.get(m.id);
      return snapshot ? [snapshot] : [];
    });
    return {
      name: seed,
      keywordIds: members.map((m) => m.id),
      evidence: {
        keywords: members.map((m) => {
          const metric = latest.get(m.id);
          return {
            phrase: m.phrase,
            searchVolume: metric?.searchVolume ?? null,
            cpcUsd:
              metric?.cpcMicros == null ? null : metric.cpcMicros / 1_000_000,
            keywordDifficulty: metric?.keywordDifficulty ?? null,
            fetchedAt: metric?.fetchedAt ?? null,
          };
        }),
        serpAudited: audited.length > 0,
        signals: clusterSignals.map((s) => ({
          observedAt: s.observedAt,
          source: s.metadata.source ?? null,
        })),
      },
      serpSnapshotIds: audited.map((s) => s.id),
      serpTitles: titles
        .filter((t) => audited.some((s) => s.id === t.snapshotId))
        .map((t) => t.title),
      signalIds: clusterSignals.map((s) => s.id),
      intents: members.map((m) => classifyIntent(m.phrase)),
    };
  });
}

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
}) {
  const { database, analyst, budget, now, projectId, runId } = deps;
  let budgetExhausted = false;
  const scored = (await clusters(database, projectId))
    .filter((c) => c.evidence.keywords.some((k) => k.searchVolume !== null))
    .map((c) => {
      const dimensions = scoreDimensions(c.evidence);
      const score = totalScore(dimensions);
      const conf = confidence(c.evidence, now());
      return { cluster: c, dimensions, score, confidence: conf };
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.confidence - a.confidence ||
        a.cluster.name.localeCompare(b.cluster.name),
    )
    .slice(0, TOP_OPPORTUNITIES);

  for (const [index, item] of scored.entries()) {
    const { cluster } = item;
    let analysis: Record<string, unknown> | null = null;
    let analysisError: string | null = null;
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
            keywords: cluster.evidence.keywords.map((k, i) => ({
              phrase: k.phrase,
              searchVolume: k.searchVolume,
              intent: cluster.intents[i],
            })),
            serpTitles: cluster.serpTitles,
            signalSources: [
              ...new Set(
                cluster.evidence.signals.flatMap((s) =>
                  s.source ? [s.source] : [],
                ),
              ),
            ],
          }),
      );
      if (!charged) {
        budgetExhausted = true;
        analysisError = "BUDGET_EXHAUSTED";
      } else {
        const parsed = analysisSchema.safeParse(charged.value);
        if (parsed.success) analysis = parsed.data;
        else analysisError = "AI_INVALID_OUTPUT";
      }
    } catch (error) {
      analysisError = "AI_ERROR";
      logger.warn("research.analysis_failed", { runId, error });
    }
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
        needsReview: needsReview(item.score, item.confidence),
        rank: index + 1,
        analysis,
        analysisError,
        analystProvider: analyst.name,
        analystModel: analyst.model,
        analystPromptVersion: analyst.promptVersion,
        evidence: {
          keywordIds: cluster.keywordIds,
          serpSnapshotIds: cluster.serpSnapshotIds,
          signalIds: cluster.signalIds,
        },
      });
    });
  }
  return { evaluated: scored.length, budgetExhausted };
}
