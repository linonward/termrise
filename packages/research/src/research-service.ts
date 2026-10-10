import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import type { Database } from "@repo/db/client";
import { researchProjects, sourceSignals } from "@repo/db/schema";
import { AppError } from "@repo/observability/errors";

import {
  DEFAULT_AI_BUDGET_USD,
  DEFAULT_DATA_BUDGET_USD,
  DEFAULT_LANGUAGE_CODE,
  DEFAULT_LOCATION_CODE,
  MAX_BUDGET_USD,
  MAX_SEEDS,
  normalizeSeeds,
  PROJECT_NAME_MAX_LENGTH,
  SEED_MAX_LENGTH,
} from "./research-rules";
import { parseSignalCsv } from "./signal-import";

export type ResearchProject = typeof researchProjects.$inferSelect;
export type SourceSignal = typeof sourceSignals.$inferSelect;

const importSchema = z.object({ csv: z.string() });
/** Rejected rows listed in the response; the counts cover all of them. */
const MAX_REJECTED_LISTED = 20;

// US dollars in whole cents; stored as micro-USD.
const usd = z
  .number()
  .min(0)
  .max(MAX_BUDGET_USD)
  .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6, {
    message: "budget must be whole cents",
  });
const toMicros = (value: number) => Math.round(value * 100) * 10_000;
const budget = usd.transform(toMicros);
const seeds = z
  .array(z.string().max(SEED_MAX_LENGTH))
  .max(MAX_SEEDS * 2)
  .transform(normalizeSeeds)
  .pipe(z.array(z.string()).min(1).max(MAX_SEEDS));
const fields = {
  name: z.string().trim().min(1).max(PROJECT_NAME_MAX_LENGTH),
  seeds,
  dataBudgetUsd: budget,
  aiBudgetUsd: budget,
};
const createSchema = z.object({
  ...fields,
  dataBudgetUsd: usd.default(DEFAULT_DATA_BUDGET_USD).transform(toMicros),
  aiBudgetUsd: usd.default(DEFAULT_AI_BUDGET_USD).transform(toMicros),
});
const updateSchema = z.object(fields).partial();

function parse<T extends z.ZodType>(schema: T, body: unknown): z.output<T> {
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    throw new AppError("INVALID_INPUT", "Invalid research project");
  return parsed.data;
}

const notFound = () =>
  new AppError("RESEARCH_PROJECT_NOT_FOUND", "Research project not found");

// Research projects (docs/architecture/data-model.md#research-projects). Only this service
// changes a project; a project can be edited or deleted while it is a draft.
export function createResearchService(deps: {
  database: Database;
  now?: () => Date;
}) {
  const { database } = deps;
  const now = deps.now ?? (() => new Date());

  async function create(userId: string, body: unknown) {
    const input = parse(createSchema, body);
    const [project] = await database
      .insert(researchProjects)
      .values({
        userId,
        name: input.name,
        seeds: input.seeds,
        locationCode: DEFAULT_LOCATION_CODE,
        languageCode: DEFAULT_LANGUAGE_CODE,
        dataBudgetMicros: input.dataBudgetUsd,
        aiBudgetMicros: input.aiBudgetUsd,
      })
      .returning();
    return project;
  }

  async function list(userId: string, limit = 50) {
    return database
      .select()
      .from(researchProjects)
      .where(eq(researchProjects.userId, userId))
      .orderBy(desc(researchProjects.createdAt), desc(researchProjects.id))
      .limit(limit);
  }

  // Another user's project and a malformed id look the same: not found.
  async function get(userId: string, id: string) {
    if (!z.uuid().safeParse(id).success) throw notFound();
    const [project] = await database
      .select()
      .from(researchProjects)
      .where(
        and(eq(researchProjects.id, id), eq(researchProjects.userId, userId)),
      );
    if (!project) throw notFound();
    return project;
  }

  // The status check is part of the update, so a project that starts running meanwhile
  // is not changed.
  async function update(userId: string, id: string, body: unknown) {
    const input = parse(updateSchema, body);
    await get(userId, id);
    const [project] = await database
      .update(researchProjects)
      .set({
        name: input.name,
        seeds: input.seeds,
        dataBudgetMicros: input.dataBudgetUsd,
        aiBudgetMicros: input.aiBudgetUsd,
        updatedAt: now(),
      })
      .where(
        and(
          eq(researchProjects.id, id),
          eq(researchProjects.userId, userId),
          eq(researchProjects.status, "draft"),
        ),
      )
      .returning();
    if (!project)
      throw new AppError("RESEARCH_PROJECT_LOCKED", "Project is not a draft");
    return project;
  }

  async function remove(userId: string, id: string) {
    await get(userId, id);
    const deleted = await database
      .delete(researchProjects)
      .where(
        and(
          eq(researchProjects.id, id),
          eq(researchProjects.userId, userId),
          eq(researchProjects.status, "draft"),
        ),
      )
      .returning({ id: researchProjects.id });
    if (deleted.length === 0)
      throw new AppError("RESEARCH_PROJECT_LOCKED", "Project is not a draft");
  }

  // One transaction with the project row locked: imports into the same project run one
  // after another, so the seed list never loses a term.
  async function importCsv(userId: string, id: string, body: unknown) {
    const { csv } = parse(importSchema, body);
    await get(userId, id);
    const parsed = parseSignalCsv(csv);
    if (!parsed.ok)
      throw new AppError("INVALID_INPUT", "Invalid CSV", undefined, {
        reason: parsed.problem,
      });
    return database.transaction(async (tx) => {
      const [project] = await tx
        .select()
        .from(researchProjects)
        .where(
          and(eq(researchProjects.id, id), eq(researchProjects.userId, userId)),
        )
        .for("update");
      if (!project) throw notFound();
      if (project.status !== "draft")
        throw new AppError("RESEARCH_PROJECT_LOCKED", "Project is not a draft");
      const inserted =
        parsed.signals.length === 0
          ? []
          : await tx
              .insert(sourceSignals)
              .values(
                parsed.signals.map((signal) => ({
                  ...signal,
                  projectId: id,
                  provider: "csv" as const,
                })),
              )
              .onConflictDoNothing()
              .returning({ term: sourceSignals.normalizedTerm });
      // New terms join the seeds after the existing ones, up to the limit.
      const candidates = normalizeSeeds(inserted.map((row) => row.term)).filter(
        (term) => !project.seeds.includes(term),
      );
      const room = Math.max(0, MAX_SEEDS - project.seeds.length);
      const added = candidates.slice(0, room);
      if (added.length > 0)
        await tx
          .update(researchProjects)
          .set({ seeds: [...project.seeds, ...added], updatedAt: now() })
          .where(eq(researchProjects.id, id));
      return {
        imported: inserted.length,
        duplicates: parsed.signals.length - inserted.length,
        rejectedCount: parsed.rejected.length,
        rejected: parsed.rejected.slice(0, MAX_REJECTED_LISTED),
        seedsAdded: added.length,
        seedsSkipped: candidates.length - added.length,
      };
    });
  }

  /** Newest observations first; signals without a date after those with one. */
  async function listSignals(userId: string, id: string, limit = 200) {
    await get(userId, id);
    return database
      .select()
      .from(sourceSignals)
      .where(eq(sourceSignals.projectId, id))
      .orderBy(
        sql`${sourceSignals.observedAt} desc nulls last`,
        desc(sourceSignals.ingestedAt),
        desc(sourceSignals.id),
      )
      .limit(limit);
  }

  return { create, list, get, update, remove, importCsv, listSignals };
}
