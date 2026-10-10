import { and, asc, eq, inArray, lt } from "drizzle-orm";
import { z } from "zod";

import type { Database } from "@repo/db/client";
import {
  apiUsage,
  keywordMetricSnapshots,
  keywords,
  researchProjects,
  researchRuns,
  serpResults,
  serpSnapshots,
} from "@repo/db/schema";
import { AppError } from "@repo/observability/errors";
import { logger } from "@repo/observability/logger";

import { createBudget } from "./budget";
import { evaluateOpportunities } from "./evaluate";
import type {
  Charged,
  KeywordIdea,
  KeywordProvider,
  Market,
} from "./keyword-provider";
import type { OpportunityAnalyst } from "./opportunity-analyst";
import { cacheKey, createProviderCache } from "./provider-cache";
import { normalizeSeeds } from "./research-rules";

export type ResearchRun = typeof researchRuns.$inferSelect;

/** Keywords kept per run: the seeds first, then expansions in order. */
export const MAX_KEYWORDS = 200;
/** Keywords whose SERP is audited: the highest search volume first. */
export const SERP_AUDIT_COUNT = 5;
/**
 * A run still running this long after its claim lost its worker (a crash or a stop
 * without SIGTERM). A full run takes minutes: 50 seeds at 5 seconds each is about 4.
 */
export const STALE_RUN_MS = 30 * 60 * 1000;

const runSchema = z.object({ requestId: z.uuid() });
// Statuses a run may start from: a fresh draft, or a retry after a failure.
const STARTABLE = ["draft", "failed", "budget_exhausted", "cancelled"] as const;

// Runs a research project's stages (docs/architecture/data-model.md#research-runs-and-keywords):
// expand the seeds with metrics, audit the SERP of the top keywords, then cluster, score
// and rank the opportunities (evaluate.ts). Synchronous for
// now; the stages move to apps/worker with the real providers (docs/roadmap.md).
// Only this runner and ResearchService change a project's status.
/** Queues runs and finds the waiting ones; the API uses it without any provider. */
export function createRunQueue(deps: { database: Database; now?: () => Date }) {
  const { database } = deps;
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
        .values({ projectId, requestId, status: "pending", stage: "queued" })
        .returning();
      await tx
        .update(researchProjects)
        .set({ status: "expanding", updatedAt: now() })
        .where(eq(researchProjects.id, projectId));
      return { run, started: true };
    });
  }

  /**
   * Queues a run for the worker (docs/architecture/jobs.md) and locks the project; a
   * retried request returns the same run.
   */
  async function queue(userId: string, projectId: string, body: unknown) {
    const parsed = runSchema.safeParse(body);
    if (!parsed.success)
      throw new AppError("INVALID_INPUT", "requestId required");
    await ownedProject(userId, projectId);
    const done = await findRun(projectId, parsed.data.requestId);
    if (done) return done;
    return (await start(projectId, parsed.data.requestId)).run;
  }

  /** Runs waiting for the worker, oldest first. */
  async function pendingRunIds(limit = 20) {
    const rows = await database
      .select({ id: researchRuns.id })
      .from(researchRuns)
      .where(eq(researchRuns.status, "pending"))
      .orderBy(asc(researchRuns.startedAt))
      .limit(limit);
    return rows.map((row) => row.id);
  }

  /**
   * Fails the runs a worker claimed more than `olderThanMs` ago and never finished, so
   * their projects can run again. Their open paid calls become failed: the cost is
   * unknown, so the reservation stays counted (budget.ts).
   */
  async function failStaleRuns(olderThanMs = STALE_RUN_MS) {
    const cutoff = new Date(now().getTime() - olderThanMs);
    return database.transaction(async (tx) => {
      const stale = await tx
        .update(researchRuns)
        .set({
          status: "failed",
          errorCode: "RUN_TIMED_OUT",
          finishedAt: now(),
        })
        .where(
          and(
            eq(researchRuns.status, "running"),
            lt(researchRuns.claimedAt, cutoff),
          ),
        )
        .returning({ id: researchRuns.id, projectId: researchRuns.projectId });
      if (stale.length === 0) return [];
      await tx
        .update(researchProjects)
        .set({ status: "failed", updatedAt: now() })
        .where(
          inArray(
            researchProjects.id,
            stale.map((r) => r.projectId),
          ),
        );
      await tx
        .update(apiUsage)
        .set({ status: "failed", settledAt: now() })
        .where(
          and(
            inArray(
              apiUsage.runId,
              stale.map((r) => r.id),
            ),
            eq(apiUsage.status, "reserved"),
          ),
        );
      return stale.map((r) => r.id);
    });
  }

  /**
   * Cancels a queued or running run and frees its project to run again. A running
   * worker stops before its next paid call; a call already out still settles.
   */
  async function cancel(userId: string, projectId: string, runId: string) {
    await ownedProject(userId, projectId);
    if (!z.uuid().safeParse(runId).success) throw runNotFound();
    return database.transaction(async (tx) => {
      const [run] = await tx
        .update(researchRuns)
        .set({ status: "cancelled", finishedAt: now() })
        .where(
          and(
            eq(researchRuns.id, runId),
            eq(researchRuns.projectId, projectId),
            inArray(researchRuns.status, ["pending", "running"]),
          ),
        )
        .returning();
      if (!run) {
        const [existing] = await tx
          .select({ id: researchRuns.id })
          .from(researchRuns)
          .where(
            and(
              eq(researchRuns.id, runId),
              eq(researchRuns.projectId, projectId),
            ),
          );
        throw existing
          ? new AppError("RESEARCH_RUN_FINISHED", "Run already finished")
          : runNotFound();
      }
      await tx
        .update(researchProjects)
        .set({ status: "cancelled", updatedAt: now() })
        .where(eq(researchProjects.id, projectId));
      return run;
    });
  }

  return { queue, findRun, pendingRunIds, failStaleRuns, cancel };
}

export function createResearchRunner(deps: {
  database: Database;
  provider: KeywordProvider;
  analyst: OpportunityAnalyst;
  now?: () => Date;
}) {
  const { database, provider, analyst } = deps;
  const now = deps.now ?? (() => new Date());
  const budget = createBudget({ database, now });
  const runs = createRunQueue({ database, now });
  const cache = createProviderCache({ database, now });

  async function setStage(
    run: ResearchRun,
    stage: "expanding" | "auditing" | "evaluating",
  ) {
    await database.transaction(async (tx) => {
      const [current] = await tx
        .update(researchRuns)
        .set({ stage })
        .where(
          and(eq(researchRuns.id, run.id), eq(researchRuns.status, "running")),
        )
        .returning({ id: researchRuns.id });
      // A run failed as stale no longer owns its project.
      if (!current) return;
      await tx
        .update(researchProjects)
        .set({ status: stage, updatedAt: now() })
        .where(eq(researchProjects.id, run.projectId));
    });
  }

  async function finish(
    run: ResearchRun,
    status: "completed" | "partial" | "failed",
    errorCode: string | null = null,
    projectStatus: "budget_exhausted" | null = null,
  ) {
    // One transaction: a reader never sees the run ended while the project still runs.
    return database.transaction(async (tx) => {
      const [finished] = await tx
        .update(researchRuns)
        .set({ status, errorCode, finishedAt: now() })
        .where(
          and(eq(researchRuns.id, run.id), eq(researchRuns.status, "running")),
        )
        .returning();
      if (!finished) return run;
      await tx
        .update(researchProjects)
        .set({ status: projectStatus ?? status, updatedAt: now() })
        .where(eq(researchProjects.id, run.projectId));
      return finished;
    });
  }

  // False once the run was cancelled or failed as stale: stop before the next paid call.
  async function active(run: ResearchRun) {
    const [current] = await database
      .select({ status: researchRuns.status })
      .from(researchRuns)
      .where(eq(researchRuns.id, run.id));
    return current?.status === "running";
  }

  // Each paid call goes through the budget ledger first (budget.ts).
  const call = (
    run: ResearchRun,
    operation: "expand" | "serp" | "difficulty",
  ) => ({
    projectId: run.projectId,
    runId: run.id,
    kind: "data" as const,
    provider: provider.name,
    operation,
    maxCostMicros: provider.maxCostMicros[operation] ?? 0,
  });

  /**
   * A paid call through the cache: a fresh answer is reused for free; otherwise the call
   * goes through the budget and its answer is kept. null when the budget is short.
   */
  async function cached<T>(
    run: ResearchRun,
    operation: "expand" | "serp",
    market: Market,
    params: unknown,
    paid: () => Promise<Charged<T>>,
  ): Promise<{ value: T; fetchedAt: Date } | null> {
    const ttl = provider.cacheTtlMs?.[operation];
    const request = { provider: provider.name, operation, market, params };
    if (ttl) {
      const hit = await cache.get<T>(request);
      if (hit) {
        logger.info("research.cache_hit", { runId: run.id, operation });
        return hit;
      }
    }
    const charged = await budget.charge(call(run, operation), paid);
    if (!charged) return null;
    if (ttl) await cache.set(request, charged.value, ttl);
    return { value: charged.value, fetchedAt: now() };
  }

  async function expand(
    run: ResearchRun,
    seeds: string[],
    market: { locationCode: number; languageCode: string },
  ) {
    const ideas: {
      phrase: string;
      seed: string;
      idea: KeywordIdea;
      /** When the provider answered: now, or earlier for a cached answer. */
      fetchedAt: Date;
    }[] = [];
    const seen = new Set<string>();
    let budgetExhausted = false;
    for (const seed of seeds) {
      if (!(await active(run))) break;
      const answer = await cached(run, "expand", market, seed, () =>
        provider.expand(seed, market),
      );
      if (!answer) {
        budgetExhausted = true;
        break;
      }
      for (const idea of answer.value) {
        const [phrase] = normalizeSeeds([idea.phrase]);
        if (!phrase || seen.has(phrase)) continue;
        seen.add(phrase);
        ideas.push({ phrase, seed, idea, fetchedAt: answer.fetchedAt });
      }
    }
    // Seeds always stay; expansions fill the rest up to the cap.
    const seedSet = new Set(seeds);
    return {
      ideas: [
        ...ideas.filter((i) => seedSet.has(i.phrase)),
        ...ideas.filter((i) => !seedSet.has(i.phrase)),
      ].slice(0, MAX_KEYWORDS),
      budgetExhausted,
    };
  }

  // Adds SEO difficulty where the expansion had none, in one call. A failure or a short
  // budget leaves it null: the run goes on, as partial.
  async function addDifficulty(
    run: ResearchRun,
    ideas: Awaited<ReturnType<typeof expand>>["ideas"],
    market: { locationCode: number; languageCode: string },
  ) {
    const difficulty = provider.difficulty?.bind(provider);
    const missing = ideas
      .filter((i) => i.idea.metrics.keywordDifficulty === null)
      .map((i) => i.phrase);
    if (!difficulty || missing.length === 0)
      return { failed: false, budgetExhausted: false };
    // Cached per phrase as { kd }; kd null is cached too: the provider has no data.
    const ttl = provider.cacheTtlMs?.difficulty;
    const request = (phrase: string) => ({
      provider: provider.name,
      operation: "difficulty",
      market,
      params: phrase,
    });
    const known = new Map<string, number | null>();
    if (ttl) {
      const hits = await cache.getMany<{ kd: number | null }>(
        missing.map(request),
      );
      for (const phrase of missing) {
        const hit = hits.get(cacheKey(request(phrase)));
        if (hit) known.set(phrase, hit.value.kd);
      }
    }
    const merge = () => {
      for (const i of ideas) {
        const kd = known.get(i.phrase);
        if (kd != null && i.idea.metrics.keywordDifficulty === null)
          i.idea = {
            ...i.idea,
            metrics: { ...i.idea.metrics, keywordDifficulty: kd },
          };
      }
    };
    const unknown = missing.filter((phrase) => !known.has(phrase));
    if (unknown.length === 0) {
      merge();
      return { failed: false, budgetExhausted: false };
    }
    try {
      const charged = await budget.charge(call(run, "difficulty"), () =>
        difficulty(unknown, market),
      );
      if (!charged) {
        merge();
        return { failed: false, budgetExhausted: true };
      }
      for (const phrase of unknown) {
        const kd = charged.value.get(phrase) ?? null;
        known.set(phrase, kd);
        if (ttl) await cache.set(request(phrase), { kd }, ttl);
      }
      merge();
      return { failed: false, budgetExhausted: false };
    } catch (error) {
      logger.warn("research.difficulty_failed", { runId: run.id, error });
      return { failed: true, budgetExhausted: false };
    }
  }

  async function saveKeywords(
    run: ResearchRun,
    ideas: Awaited<ReturnType<typeof expand>>["ideas"],
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
        ideas.map(({ phrase, idea, fetchedAt }) => ({
          keywordId: idOf.get(phrase)!,
          provider: provider.name,
          ...idea.metrics,
          fetchedAt,
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
    run: ResearchRun,
    saved: { id: string; phrase: string; searchVolume: number | null }[],
    market: { locationCode: number; languageCode: string },
  ) {
    const top = saved
      .filter((k) => (k.searchVolume ?? 0) > 0)
      .sort((a, b) => (b.searchVolume ?? 0) - (a.searchVolume ?? 0))
      .slice(0, SERP_AUDIT_COUNT);
    let failures = 0;
    let budgetExhausted = false;
    for (const keyword of top) {
      if (!(await active(run))) break;
      let items;
      let fetchedAt;
      try {
        const answer = await cached(run, "serp", market, keyword.phrase, () =>
          provider.serp(keyword.phrase, market),
        );
        if (!answer) {
          budgetExhausted = true;
          break;
        }
        items = answer.value;
        fetchedAt = answer.fetchedAt;
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
            fetchedAt,
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
    return { failures, budgetExhausted };
  }

  /**
   * Claims a pending run and carries it to the end. A run already claimed, by a retry
   * or a second worker, is left alone: the claim is one conditional update.
   */
  async function execute(runId: string) {
    const [run] = await database
      .update(researchRuns)
      .set({ status: "running", stage: "expanding", claimedAt: now() })
      .where(
        and(eq(researchRuns.id, runId), eq(researchRuns.status, "pending")),
      )
      .returning();
    if (!run) return null;
    const projectId = run.projectId;
    const [project] = await database
      .select()
      .from(researchProjects)
      .where(eq(researchProjects.id, projectId));
    const market = {
      locationCode: project.locationCode,
      languageCode: project.languageCode,
    };
    try {
      let expanded;
      try {
        expanded = await expand(run, project.seeds, market);
      } catch (error) {
        logger.warn("research.expand_failed", { runId: run.id, error });
        return await finish(run, "failed", "PROVIDER_ERROR");
      }
      // Not even one seed fits the data budget: nothing to evaluate. Raise it and retry.
      if (expanded.ideas.length === 0 && expanded.budgetExhausted)
        return await finish(
          run,
          "failed",
          "BUDGET_EXHAUSTED",
          "budget_exhausted",
        );
      if (!(await active(run))) return run;
      const enriched = await addDifficulty(run, expanded.ideas, market);
      const saved = await saveKeywords(run, expanded.ideas);
      await setStage(run, "auditing");
      const audit = await auditSerps(run, saved, market);
      if (!(await active(run))) return run;
      await setStage(run, "evaluating");
      const evaluation = await evaluateOpportunities({
        database,
        analyst,
        budget,
        now,
        projectId,
        runId: run.id,
        isActive: () => active(run),
      });
      // A short budget ends a stage early: the run is partial, and says why.
      const budgetExhausted =
        expanded.budgetExhausted ||
        enriched.budgetExhausted ||
        audit.budgetExhausted ||
        evaluation.budgetExhausted;
      return await finish(
        run,
        audit.failures > 0 || enriched.failed || budgetExhausted
          ? "partial"
          : "completed",
        budgetExhausted ? "BUDGET_EXHAUSTED" : null,
      );
    } catch (error) {
      logger.error("research.run_failed", { runId: run.id, error });
      await finish(run, "failed", "INTERNAL_ERROR");
      throw error;
    }
  }

  /** Queues and executes at once: tests and scripts, without a worker. */
  async function run(userId: string, projectId: string, body: unknown) {
    const queued = await runs.queue(userId, projectId, body);
    return (
      (await execute(queued.id)) ??
      (await runs.findRun(projectId, queued.requestId))
    );
  }

  return { ...runs, execute, run };
}

const notFound = () =>
  new AppError("RESEARCH_PROJECT_NOT_FOUND", "Research project not found");
const runNotFound = () =>
  new AppError("RESEARCH_RUN_NOT_FOUND", "Research run not found");
