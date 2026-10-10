import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import type { Database } from "@repo/db/client";
import { researchProjects } from "@repo/db/schema";
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

export type ResearchProject = typeof researchProjects.$inferSelect;

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

  return { create, list, get, update, remove };
}
