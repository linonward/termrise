import { and, eq } from "drizzle-orm";
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
import { logger } from "@repo/observability/logger";

import { evaluateOpportunities } from "./evaluate";
import type { KeywordIdea, KeywordProvider } from "./keyword-provider";
import type { OpportunityAnalyst } from "./opportunity-analyst";
import { normalizeSeeds } from "./research-rules";

export type ResearchRun = typeof researchRuns.$inferSelect;

/** Keywords kept per run: the seeds first, then expansions in order. */
export const MAX_KEYWORDS = 200;
/** Keywords whose SERP is audited: the highest search volume first. */
export const SERP_AUDIT_COUNT = 5;

const runSchema = z.object({ requestId: z.uuid() });
// Statuses a run may start from: a fresh draft, or a retry after a failure.
const STARTABLE = ["draft", "failed"] as const;

// Runs a research project's stages (docs/architecture/data-model.md#research-runs-and-keywords):
// expand the seeds with metrics, audit the SERP of the top keywords, then cluster, score
// and rank the opportunities (evaluate.ts). Synchronous for
// now; the stages move to apps/worker with the real providers (docs/roadmap.md).
// Only this runner and ResearchService change a project's status.
export function createResearchRunner(deps: {
  database: Database;
  provider: KeywordProvider;
  analyst: OpportunityAnalyst;
  now?: () => Date;
}) {
  const { database, provider, analyst } = deps;
  const now = deps.now ?? (() => new Date());

  async function ownedProject(userId: string, projectId: string) {
    if (!z.uuid().safeParse(projectId).success) throw notFound();
    const [project] = await database
      .select()
      .from(researchProjects)
      .where(
        and(
          eq(researchProjects.id, projectId),
          eq(researchProjects.userId, userId),
        ),
      );
    if (!project) throw notFound();
    return project;
  }

  async function findRun(projectId: string, requestId: string) {
    const [run] = await database
      .select()
      .from(researchRuns)
      .where(
        and(
          eq(researchRuns.projectId, projectId),
          eq(researchRuns.requestId, requestId),
        ),
      );
    return run;
  }

  // Locks the project, checks it can start, and records the run, in one transaction:
  // of two requests at once, the second sees the project already running.
  async function start(projectId: string, requestId: string) {
    return database.transaction(async (tx) => {
      const [project] = await tx
        .select()
        .from(researchProjects)
        .where(eq(researchProjects.id, projectId))
        .for("update");
      const [existing] = await tx
        .select()
        .from(researchRuns)
        .where(
          and(
            eq(researchRuns.projectId, projectId),
            eq(researchRuns.requestId, requestId),
          ),
        );
      if (existing) return { run: existing, started: false };
      if (!STARTABLE.includes(project.status as (typeof STARTABLE)[number]))
        throw new AppError(
          "RESEARCH_PROJECT_LOCKED",
          "Project is already running or done",
        );
      const [run] = await tx
        .insert(researchRuns)
        .values({ projectId, requestId, status: "running", stage: "expanding" })
        .returning();
      await tx
        .update(researchProjects)
        .set({ status: "expanding", updatedAt: now() })
        .where(eq(researchProjects.id, projectId));
      return { run, started: true };
    });
  }

  async function setStage(
    run: ResearchRun,
    stage: "expanding" | "auditing" | "evaluating",
  ) {
    await database
      .update(researchRuns)
      .set({ stage })
      .where(eq(researchRuns.id, run.id));
    await database
      .update(researchProjects)
      .set({ status: stage, updatedAt: now() })
      .where(eq(researchProjects.id, run.projectId));
  }

  async function finish(
    run: ResearchRun,
    status: "completed" | "partial" | "failed",
    errorCode: string | null = null,
  ) {
    const [finished] = await database
      .update(researchRuns)
      .set({ status, errorCode, finishedAt: now() })
      .where(
        and(eq(researchRuns.id, run.id), eq(researchRuns.status, "running")),
      )
      .returning();
    await database
      .update(researchProjects)
      .set({ status, updatedAt: now() })
      .where(eq(researchProjects.id, run.projectId));
    return finished ?? run;
  }

  async function expand(
    seeds: string[],
    market: { locationCode: number; languageCode: string },
  ) {
    const ideas: { phrase: string; seed: string; idea: KeywordIdea }[] = [];
    const seen = new Set<string>();
    for (const seed of seeds) {
      for (const idea of await provider.expand(seed, market)) {
        const [phrase] = normalizeSeeds([idea.phrase]);
        if (!phrase || seen.has(phrase)) continue;
        seen.add(phrase);
        ideas.push({ phrase, seed, idea });
      }
    }
    // Seeds always stay; expansions fill the rest up to the cap.
    const seedSet = new Set(seeds);
    return [
      ...ideas.filter((i) => seedSet.has(i.phrase)),
      ...ideas.filter((i) => !seedSet.has(i.phrase)),
    ].slice(0, MAX_KEYWORDS);
  }

  async function saveKeywords(
    run: ResearchRun,
    ideas: Awaited<ReturnType<typeof expand>>,
  ) {
    return database.transaction(async (tx) => {
      const rows = await tx
        .insert(keywords)
        .values(
          ideas.map(({ phrase, seed }) => ({
            projectId: run.projectId,
            runId: run.id,
            phrase,
            seed,
            source:
              phrase === seed ? ("seed" as const) : ("expansion" as const),
          })),
        )
        // A retry after a failure finds the keywords of the failed run.
        .onConflictDoUpdate({
          target: [keywords.projectId, keywords.phrase],
          set: { runId: run.id },
        })
        .returning({ id: keywords.id, phrase: keywords.phrase });
      const idOf = new Map(rows.map((row) => [row.phrase, row.id]));
      await tx.insert(keywordMetricSnapshots).values(
        ideas.map(({ phrase, idea }) => ({
          keywordId: idOf.get(phrase)!,
          provider: provider.name,
          ...idea.metrics,
        })),
      );
      return ideas.map(({ phrase, idea }) => ({
        id: idOf.get(phrase)!,
        phrase,
        searchVolume: idea.metrics.searchVolume,
      }));
    });
  }

  async function auditSerps(
    saved: { id: string; phrase: string; searchVolume: number | null }[],
    market: { locationCode: number; languageCode: string },
  ) {
    const top = saved
      .filter((k) => (k.searchVolume ?? 0) > 0)
      .sort((a, b) => (b.searchVolume ?? 0) - (a.searchVolume ?? 0))
      .slice(0, SERP_AUDIT_COUNT);
    let failures = 0;
    for (const keyword of top) {
      let items;
      try {
        items = await provider.serp(keyword.phrase, market);
      } catch (error) {
        failures++;
        logger.warn("research.serp_failed", { keywordId: keyword.id, error });
        continue;
      }
      await database.transaction(async (tx) => {
        const [snapshot] = await tx
          .insert(serpSnapshots)
          .values({
            keywordId: keyword.id,
            provider: provider.name,
            device: "desktop",
            ...market,
          })
          .returning({ id: serpSnapshots.id });
        if (items.length > 0)
          await tx
            .insert(serpResults)
            .values(
              items.map((item) => ({ ...item, snapshotId: snapshot.id })),
            );
      });
    }
    return failures;
  }

  /** Starts a run and carries it to the end; a retried request returns the same run. */
  async function run(userId: string, projectId: string, body: unknown) {
    const parsed = runSchema.safeParse(body);
    if (!parsed.success)
      throw new AppError("INVALID_INPUT", "requestId required");
    const project = await ownedProject(userId, projectId);
    const done = await findRun(projectId, parsed.data.requestId);
    if (done) return done;
    const { run, started } = await start(projectId, parsed.data.requestId);
    if (!started) return run;
    const market = {
      locationCode: project.locationCode,
      languageCode: project.languageCode,
    };
    try {
      let ideas;
      try {
        ideas = await expand(project.seeds, market);
      } catch (error) {
        logger.warn("research.expand_failed", { runId: run.id, error });
        return await finish(run, "failed", "PROVIDER_ERROR");
      }
      const saved = await saveKeywords(run, ideas);
      await setStage(run, "auditing");
      const failures = await auditSerps(saved, market);
      await setStage(run, "evaluating");
      await evaluateOpportunities({
        database,
        analyst,
        now,
        projectId,
        runId: run.id,
      });
      return await finish(run, failures > 0 ? "partial" : "completed");
    } catch (error) {
      logger.error("research.run_failed", { runId: run.id, error });
      await finish(run, "failed", "INTERNAL_ERROR");
      throw error;
    }
  }

  return { run };
}

const notFound = () =>
  new AppError("RESEARCH_PROJECT_NOT_FOUND", "Research project not found");
