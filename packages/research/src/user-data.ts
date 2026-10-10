import { asc, eq } from "drizzle-orm";

import type { Database } from "@repo/db/client";
import { researchProjects, sourceSignals } from "@repo/db/schema";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

// The user's research projects for account export and deletion (docs/runbook.md#delete-or-export-an-account).
// Deleting a project removes its source signals too (ON DELETE CASCADE).

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
  return projects.map((project) => ({
    ...project,
    signals: signals.filter((signal) => signal.projectId === project.id),
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
