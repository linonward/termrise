import { and, asc, desc, eq, inArray, isNull, lt } from "drizzle-orm";
import { z } from "zod";

import type { Database } from "@repo/db/client";
import { apiUsage, researchProjects, seedSuggestions } from "@repo/db/schema";
import { AppError } from "@repo/observability/errors";
import { logger } from "@repo/observability/logger";

import { createBudget } from "./budget";
import {
  type SeedExtractor,
  seedPhrasesSchema,
  suggestedPhrases,
} from "./seed-extractor";

export type SeedSuggestion = typeof seedSuggestions.$inferSelect;

/** A suggestion still running this long after its claim lost its worker. */
export const STALE_SUGGESTION_MS = 10 * 60 * 1000;
export const SUGGEST_SEEDS_OPERATION = "suggest_seeds";

const requestSchema = z.object({ requestId: z.uuid() });
// The statuses in which ResearchService lets the user change the seeds.
const EDITABLE = ["draft", "budget_exhausted"];
const IN_PROGRESS = ["pending", "running"] as const;

const notFound = () =>
  new AppError("RESEARCH_PROJECT_NOT_FOUND", "Research project not found");

// Seed suggestions (docs/architecture/data-model.md#seed-suggestions): the API queues
// them as rows, the worker runs them. They never change the project.
export function createSeedSuggestionQueue(deps: { database: Database }) {
  const { database } = deps;

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

  /**
   * Queues a suggestion for the project's seeds. A retried request, or a request while
   * another one is in progress, returns the existing suggestion.
   */
  async function request(userId: string, projectId: string, body: unknown) {
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success)
      throw new AppError("INVALID_INPUT", "requestId required");
    await ownedProject(userId, projectId);
    return database.transaction(async (tx) => {
      // The project row lock makes concurrent requests take turns.
      const [project] = await tx
        .select()
        .from(researchProjects)
        .where(eq(researchProjects.id, projectId))
        .for("update");
      const [existing] = await tx
        .select()
        .from(seedSuggestions)
        .where(
          and(
            eq(seedSuggestions.projectId, projectId),
            eq(seedSuggestions.requestId, parsed.data.requestId),
          ),
        );
      if (existing) return existing;
      if (!EDITABLE.includes(project.status))
        throw new AppError("RESEARCH_PROJECT_LOCKED", "Project is not a draft");
      const [active] = await tx
        .select()
        .from(seedSuggestions)
        .where(
          and(
            eq(seedSuggestions.projectId, projectId),
            inArray(seedSuggestions.status, IN_PROGRESS),
          ),
        );
      if (active) return active;
      const [row] = await tx
        .insert(seedSuggestions)
        .values({
          projectId,
          requestId: parsed.data.requestId,
          status: "pending",
          sourceSeeds: project.seeds,
        })
        .returning();
      return row;
    });
  }

  /** The project's newest suggestion, or null. */
  async function latest(userId: string, projectId: string) {
    await ownedProject(userId, projectId);
    const [row] = await database
      .select()
      .from(seedSuggestions)
      .where(eq(seedSuggestions.projectId, projectId))
      .orderBy(desc(seedSuggestions.createdAt), desc(seedSuggestions.id))
      .limit(1);
    return row ?? null;
  }

  return { request, latest };
}

/** Runs queued suggestions; the worker uses it. */
export function createSeedSuggester(deps: {
  database: Database;
  extractor: SeedExtractor;
  now?: () => Date;
}) {
  const { database, extractor } = deps;
  const now = deps.now ?? (() => new Date());
  const budget = createBudget({ database, now });

  /** Suggestions waiting for the worker, oldest first. */
  async function pendingIds(limit = 20) {
    const rows = await database
      .select({ id: seedSuggestions.id })
      .from(seedSuggestions)
      .where(eq(seedSuggestions.status, "pending"))
      .orderBy(asc(seedSuggestions.createdAt))
      .limit(limit);
    return rows.map((r) => r.id);
  }

  // Only a suggestion still running is finished: a stale one failed meanwhile stays so.
  async function finish(
    id: string,
    values: Partial<typeof seedSuggestions.$inferInsert>,
  ) {
    const [row] = await database
      .update(seedSuggestions)
      .set({ ...values, finishedAt: now() })
      .where(
        and(eq(seedSuggestions.id, id), eq(seedSuggestions.status, "running")),
      )
      .returning();
    return row ?? null;
  }

  /** Claims and runs one suggestion; null when another worker has it. */
  async function execute(id: string) {
    const [claimed] = await database
      .update(seedSuggestions)
      .set({ status: "running", claimedAt: now() })
      .where(
        and(eq(seedSuggestions.id, id), eq(seedSuggestions.status, "pending")),
      )
      .returning();
    if (!claimed) return null;
    const source = {
      provider: extractor.name,
      model: extractor.model,
      promptVersion: extractor.promptVersion,
    };
    let charged;
    try {
      charged = await budget.charge(
        {
          projectId: claimed.projectId,
          runId: null,
          kind: "ai",
          provider: extractor.name,
          operation: SUGGEST_SEEDS_OPERATION,
          maxCostMicros: extractor.maxCostMicros,
        },
        () => extractor.extract(claimed.sourceSeeds),
      );
    } catch (error) {
      logger.warn("seeds.suggest_failed", { suggestionId: id, error });
      return finish(id, {
        ...source,
        status: "failed",
        errorCode: "PROVIDER_ERROR",
      });
    }
    if (!charged)
      return finish(id, {
        ...source,
        status: "failed",
        errorCode: "BUDGET_EXHAUSTED",
      });
    const parsed = seedPhrasesSchema.safeParse(charged.value);
    const phrases = parsed.success ? suggestedPhrases(parsed.data) : [];
    if (phrases.length === 0)
      return finish(id, {
        ...source,
        status: "failed",
        errorCode: "INVALID_AI_OUTPUT",
      });
    return finish(id, { ...source, status: "completed", phrases });
  }

  /** Fails suggestions whose worker died, and their open reservations. */
  async function failStale(olderThanMs = STALE_SUGGESTION_MS) {
    const cutoff = new Date(now().getTime() - olderThanMs);
    return database.transaction(async (tx) => {
      const stale = await tx
        .update(seedSuggestions)
        .set({
          status: "failed",
          errorCode: "SUGGESTION_TIMED_OUT",
          finishedAt: now(),
        })
        .where(
          and(
            eq(seedSuggestions.status, "running"),
            lt(seedSuggestions.claimedAt, cutoff),
          ),
        )
        .returning({
          id: seedSuggestions.id,
          projectId: seedSuggestions.projectId,
        });
      if (stale.length === 0) return [];
      await tx
        .update(apiUsage)
        .set({ status: "failed", settledAt: now() })
        .where(
          and(
            inArray(
              apiUsage.projectId,
              stale.map((s) => s.projectId),
            ),
            isNull(apiUsage.runId),
            eq(apiUsage.operation, SUGGEST_SEEDS_OPERATION),
            eq(apiUsage.status, "reserved"),
          ),
        );
      return stale.map((s) => s.id);
    });
  }

  return { pendingIds, execute, failStale };
}
