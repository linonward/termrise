import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import type { Database } from "@repo/db/client";
import {
  keywordMetricSnapshots,
  keywords,
  researchProjects,
  researchRuns,
  serpResults,
  serpSnapshots,
} from "@repo/db/schema";
import { AppError } from "@repo/observability/errors";

// What research runs stored: runs, keywords with their newest metrics, and SERPs. Reads
// need no provider.
export function createResearchResults(deps: { database: Database }) {
  const { database } = deps;

  async function ownedProject(userId: string, projectId: string) {
    if (!z.uuid().safeParse(projectId).success) throw notFound();
    const [project] = await database
      .select({ id: researchProjects.id })
      .from(researchProjects)
      .where(
        and(
          eq(researchProjects.id, projectId),
          eq(researchProjects.userId, userId),
        ),
      );
    if (!project) throw notFound();
  }

  async function listRuns(userId: string, projectId: string) {
    await ownedProject(userId, projectId);
    return database
      .select()
      .from(researchRuns)
      .where(eq(researchRuns.projectId, projectId))
      .orderBy(desc(researchRuns.startedAt), desc(researchRuns.id));
  }

  /** Keywords with their newest metrics, highest search volume first, no data last. */
  async function listKeywords(userId: string, projectId: string) {
    await ownedProject(userId, projectId);
    const rows = await database
      .select()
      .from(keywords)
      .where(eq(keywords.projectId, projectId));
    if (rows.length === 0) return [];
    const snapshots = await database
      .select()
      .from(keywordMetricSnapshots)
      .where(
        inArray(
          keywordMetricSnapshots.keywordId,
          rows.map((row) => row.id),
        ),
      )
      .orderBy(
        desc(keywordMetricSnapshots.fetchedAt),
        desc(keywordMetricSnapshots.id),
      );
    const latest = new Map<string, (typeof snapshots)[number]>();
    for (const snapshot of snapshots)
      if (!latest.has(snapshot.keywordId))
        latest.set(snapshot.keywordId, snapshot);
    return rows
      .map((keyword) => ({ keyword, metrics: latest.get(keyword.id) ?? null }))
      .sort(
        (a, b) =>
          (b.metrics?.searchVolume ?? -1) - (a.metrics?.searchVolume ?? -1) ||
          a.keyword.phrase.localeCompare(b.keyword.phrase),
      );
  }

  /** The newest SERP of each audited keyword. */
  async function listSerps(userId: string, projectId: string) {
    await ownedProject(userId, projectId);
    const snapshots = await database
      .select({ snapshot: serpSnapshots, phrase: keywords.phrase })
      .from(serpSnapshots)
      .innerJoin(keywords, eq(serpSnapshots.keywordId, keywords.id))
      .where(eq(keywords.projectId, projectId))
      .orderBy(desc(serpSnapshots.fetchedAt), desc(serpSnapshots.id));
    const newest = new Map<string, (typeof snapshots)[number]>();
    for (const row of snapshots)
      if (!newest.has(row.snapshot.keywordId))
        newest.set(row.snapshot.keywordId, row);
    const picked = [...newest.values()];
    if (picked.length === 0) return [];
    const results = await database
      .select()
      .from(serpResults)
      .where(
        inArray(
          serpResults.snapshotId,
          picked.map((row) => row.snapshot.id),
        ),
      )
      .orderBy(serpResults.rank);
    return picked.map(({ snapshot, phrase }) => ({
      phrase,
      snapshot,
      results: results.filter((r) => r.snapshotId === snapshot.id),
    }));
  }

  return { listRuns, listKeywords, listSerps };
}

const notFound = () =>
  new AppError("RESEARCH_PROJECT_NOT_FOUND", "Research project not found");
