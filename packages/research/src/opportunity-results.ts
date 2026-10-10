import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import type { Database } from "@repo/db/client";
import {
  keywordMetricSnapshots,
  keywords,
  opportunities,
  opportunityDecisions,
  opportunityEvaluations,
  researchProjects,
  serpResults,
  serpSnapshots,
  sourceSignals,
  user,
  validationExperiments,
} from "@repo/db/schema";
import { AppError } from "@repo/observability/errors";

export type Opportunity = typeof opportunities.$inferSelect;
export type OpportunityEvaluation = typeof opportunityEvaluations.$inferSelect;

const notFound = () =>
  new AppError("OPPORTUNITY_NOT_FOUND", "Opportunity not found");

// Opportunities and their current evaluation (docs/architecture/data-model.md#opportunities).
// Current: the newest evaluation, from the project's newest run that produced any. An
// opportunity that dropped out of the top in that run is not current and not listed.
export function createOpportunityResults(deps: { database: Database }) {
  const { database } = deps;

  async function current(projectIds: string[]) {
    if (projectIds.length === 0) return [];
    const rows = await database
      .select({
        opportunity: opportunities,
        evaluation: opportunityEvaluations,
      })
      .from(opportunityEvaluations)
      .innerJoin(
        opportunities,
        eq(opportunityEvaluations.opportunityId, opportunities.id),
      )
      .where(inArray(opportunities.projectId, projectIds))
      .orderBy(
        desc(opportunityEvaluations.createdAt),
        desc(opportunityEvaluations.id),
      );
    const newestRun = new Map<string, string>();
    for (const row of rows)
      if (!newestRun.has(row.opportunity.projectId))
        newestRun.set(row.opportunity.projectId, row.evaluation.runId);
    const seen = new Set<string>();
    return rows.filter((row) => {
      if (seen.has(row.opportunity.id)) return false;
      seen.add(row.opportunity.id);
      return row.evaluation.runId === newestRun.get(row.opportunity.projectId);
    });
  }

  /** The user's current opportunities, best score first; one project or all. */
  async function list(userId: string, projectId?: string) {
    if (projectId !== undefined && !z.uuid().safeParse(projectId).success)
      return [];
    const projects = await database
      .select({ id: researchProjects.id, name: researchProjects.name })
      .from(researchProjects)
      .where(
        projectId
          ? and(
              eq(researchProjects.userId, userId),
              eq(researchProjects.id, projectId),
            )
          : eq(researchProjects.userId, userId),
      );
    if (projectId && projects.length === 0) return [];
    const nameOf = new Map(projects.map((p) => [p.id, p.name]));
    return (await current(projects.map((p) => p.id)))
      .map((row) => ({
        ...row,
        projectName: nameOf.get(row.opportunity.projectId)!,
      }))
      .sort(
        (a, b) =>
          b.evaluation.score - a.evaluation.score ||
          b.evaluation.confidence - a.evaluation.confidence,
      );
  }

  /** One opportunity with the evidence its evaluation cites. */
  async function get(userId: string, id: string) {
    if (!z.uuid().safeParse(id).success) throw notFound();
    const [row] = await database
      .select({
        opportunity: opportunities,
        projectName: researchProjects.name,
      })
      .from(opportunities)
      .innerJoin(
        researchProjects,
        eq(opportunities.projectId, researchProjects.id),
      )
      .where(
        and(eq(opportunities.id, id), eq(researchProjects.userId, userId)),
      );
    if (!row) throw notFound();
    const [evaluation] = await database
      .select()
      .from(opportunityEvaluations)
      .where(eq(opportunityEvaluations.opportunityId, id))
      .orderBy(
        desc(opportunityEvaluations.createdAt),
        desc(opportunityEvaluations.id),
      )
      .limit(1);
    const { keywordIds, serpSnapshotIds, signalIds } = evaluation.evidence;
    const keywordRows =
      keywordIds.length === 0
        ? []
        : await database
            .select()
            .from(keywords)
            .where(inArray(keywords.id, keywordIds));
    const metrics =
      keywordIds.length === 0
        ? []
        : await database
            .select()
            .from(keywordMetricSnapshots)
            .where(inArray(keywordMetricSnapshots.keywordId, keywordIds))
            .orderBy(
              desc(keywordMetricSnapshots.fetchedAt),
              desc(keywordMetricSnapshots.id),
            );
    const latest = new Map<string, (typeof metrics)[number]>();
    for (const m of metrics)
      if (!latest.has(m.keywordId)) latest.set(m.keywordId, m);
    const serps =
      serpSnapshotIds.length === 0
        ? []
        : await database
            .select({ snapshot: serpSnapshots, phrase: keywords.phrase })
            .from(serpSnapshots)
            .innerJoin(keywords, eq(serpSnapshots.keywordId, keywords.id))
            .where(inArray(serpSnapshots.id, serpSnapshotIds));
    const results =
      serps.length === 0
        ? []
        : await database
            .select()
            .from(serpResults)
            .where(inArray(serpResults.snapshotId, serpSnapshotIds))
            .orderBy(serpResults.rank);
    const signals =
      signalIds.length === 0
        ? []
        : await database
            .select()
            .from(sourceSignals)
            .where(inArray(sourceSignals.id, signalIds));
    const decisions = await database
      .select({
        decision: opportunityDecisions,
        deciderName: user.name,
        scoringVersion: opportunityEvaluations.scoringVersion,
        score: opportunityEvaluations.score,
      })
      .from(opportunityDecisions)
      .innerJoin(user, eq(opportunityDecisions.deciderId, user.id))
      .innerJoin(
        opportunityEvaluations,
        eq(opportunityDecisions.evaluationId, opportunityEvaluations.id),
      )
      .where(eq(opportunityDecisions.opportunityId, id))
      .orderBy(
        desc(opportunityDecisions.createdAt),
        desc(opportunityDecisions.id),
      );
    const experiments = await database
      .select()
      .from(validationExperiments)
      .where(eq(validationExperiments.opportunityId, id))
      .orderBy(validationExperiments.createdAt, validationExperiments.id);
    return {
      opportunity: row.opportunity,
      projectName: row.projectName,
      evaluation,
      decisions,
      experiments,
      keywords: keywordRows
        .map((keyword) => ({
          keyword,
          metrics: latest.get(keyword.id) ?? null,
        }))
        .sort(
          (a, b) =>
            (b.metrics?.searchVolume ?? -1) - (a.metrics?.searchVolume ?? -1) ||
            a.keyword.phrase.localeCompare(b.keyword.phrase),
        ),
      serps: serps.map(({ snapshot, phrase }) => ({
        phrase,
        snapshot,
        results: results.filter((r) => r.snapshotId === snapshot.id),
      })),
      signals,
    };
  }

  return { list, get };
}
