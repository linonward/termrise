import { asc, eq } from "drizzle-orm";

import type { Database } from "@repo/db/client";
import {
  opportunities,
  opportunityDecisions,
  researchProjects,
  sourceSignals,
  validationExperiments,
} from "@repo/db/schema";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

// The user's research projects for account export and deletion (docs/runbook.md#delete-or-export-an-account).
// Deleting a project removes its signals, runs and opportunities too (ON DELETE CASCADE).

export async function exportResearchData(database: Database, userId: string) {
  const projects = await database
    .select({
      id: researchProjects.id,
      createdAt: researchProjects.createdAt,
      name: researchProjects.name,
      locationCode: researchProjects.locationCode,
      languageCode: researchProjects.languageCode,
      seeds: researchProjects.seeds,
      status: researchProjects.status,
    })
    .from(researchProjects)
    .where(eq(researchProjects.userId, userId))
    .orderBy(asc(researchProjects.createdAt));
  const signals = await database
    .select({
      projectId: sourceSignals.projectId,
      provider: sourceSignals.provider,
      term: sourceSignals.normalizedTerm,
      rawTitle: sourceSignals.rawTitle,
      url: sourceSignals.url,
      observedAt: sourceSignals.observedAt,
      metadata: sourceSignals.metadata,
    })
    .from(sourceSignals)
    .innerJoin(
      researchProjects,
      eq(sourceSignals.projectId, researchProjects.id),
    )
    .where(eq(researchProjects.userId, userId))
    .orderBy(asc(sourceSignals.ingestedAt));
  const opportunityRows = await database
    .select({
      id: opportunities.id,
      projectId: opportunities.projectId,
      cluster: opportunities.cluster,
      status: opportunities.status,
      starredAt: opportunities.starredAt,
      createdAt: opportunities.createdAt,
    })
    .from(opportunities)
    .innerJoin(
      researchProjects,
      eq(opportunities.projectId, researchProjects.id),
    )
    .where(eq(researchProjects.userId, userId))
    .orderBy(asc(opportunities.createdAt));
  const decisions = await database
    .select({
      opportunityId: opportunityDecisions.opportunityId,
      decision: opportunityDecisions.decision,
      reason: opportunityDecisions.reason,
      createdAt: opportunityDecisions.createdAt,
    })
    .from(opportunityDecisions)
    .innerJoin(
      opportunities,
      eq(opportunityDecisions.opportunityId, opportunities.id),
    )
    .innerJoin(
      researchProjects,
      eq(opportunities.projectId, researchProjects.id),
    )
    .where(eq(researchProjects.userId, userId))
    .orderBy(asc(opportunityDecisions.createdAt));
  const experiments = await database
    .select({
      opportunityId: validationExperiments.opportunityId,
      kind: validationExperiments.kind,
      hypothesis: validationExperiments.hypothesis,
      channel: validationExperiments.channel,
      metric: validationExperiments.metric,
      successThreshold: validationExperiments.successThreshold,
      stopCondition: validationExperiments.stopCondition,
      status: validationExperiments.status,
      resultNote: validationExperiments.resultNote,
      createdAt: validationExperiments.createdAt,
    })
    .from(validationExperiments)
    .innerJoin(
      opportunities,
      eq(validationExperiments.opportunityId, opportunities.id),
    )
    .innerJoin(
      researchProjects,
      eq(opportunities.projectId, researchProjects.id),
    )
    .where(eq(researchProjects.userId, userId))
    .orderBy(asc(validationExperiments.createdAt));
  const of =
    (opportunityId: string) =>
    <T extends { opportunityId: string }>(row: T) =>
      row.opportunityId === opportunityId;
  return projects.map((project) => ({
    ...project,
    signals: signals.filter((signal) => signal.projectId === project.id),
    opportunities: opportunityRows
      .filter((o) => o.projectId === project.id)
      .map((o) => ({
        cluster: o.cluster,
        status: o.status,
        starredAt: o.starredAt,
        createdAt: o.createdAt,
        decisions: decisions.filter(of(o.id)),
        experiments: experiments.filter(of(o.id)),
      })),
  }));
}

export async function eraseResearchData(
  database: Database | Transaction,
  userId: string,
) {
  await database
    .delete(researchProjects)
    .where(eq(researchProjects.userId, userId));
}
