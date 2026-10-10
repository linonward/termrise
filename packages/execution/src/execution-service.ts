import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import type { Database } from "@repo/db/client";
import {
  EXECUTION_METRICS,
  executionEvents,
  executionProjects,
  opportunities,
  PRODUCT_STATUSES,
  researchProjects,
  revenueEvents,
} from "@repo/db/schema";
import { AppError } from "@repo/observability/errors";

import { LAUNCHED_STATUSES } from "./execution-rules";

export type ExecutionProject = typeof executionProjects.$inferSelect;
export type ExecutionEvent = typeof executionEvents.$inferSelect;
export type RevenueEvent = typeof revenueEvents.$inferSelect;

const NAME_MAX_LENGTH = 100;
const NOTE_MAX_LENGTH = 500;
const MAX_ROWS = 500;

const day = z.iso.date();
const note = z.string().trim().max(NOTE_MAX_LENGTH).optional();
// Money in major units with at most two decimals, stored in minor units.
const money = z
  .number()
  .min(0)
  .max(10_000_000)
  .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, {
    message: "at most two decimals",
  })
  .transform((v) => Math.round(v * 100));

const createSchema = z.object({
  opportunityId: z.uuid(),
  name: z.string().trim().min(1).max(NAME_MAX_LENGTH).optional(),
});
const updateSchema = z
  .object({
    name: z.string().trim().min(1).max(NAME_MAX_LENGTH),
    repoUrl: z
      .url({ protocol: /^https?$/ })
      .max(300)
      .nullable(),
    domain: z
      .string()
      .trim()
      .toLowerCase()
      .regex(
        /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/,
      )
      .nullable(),
    launchedOn: day.nullable(),
    status: z.enum(PRODUCT_STATUSES),
  })
  .partial();
const eventSchema = z
  .object({
    metric: z.enum(EXECUTION_METRICS),
    count: z.number().int().min(0).max(1_000_000_000),
    periodStart: day,
    periodEnd: day,
    note,
  })
  .refine((e) => e.periodEnd >= e.periodStart, { message: "period" });
const revenueSchema = z
  .object({
    occurredOn: day,
    currency: z.string().regex(/^[A-Z]{3}$/),
    orders: z.number().int().min(0).max(1_000_000),
    gross: money,
    refund: money.default(0),
    /** Omitted or null: the fees are unknown. */
    fees: money.nullable().optional(),
    evidence: z.string().trim().max(300).optional(),
    note,
  })
  .refine((r) => r.refund <= r.gross, { message: "refund above gross" });

function parse<T extends z.ZodType>(schema: T, body: unknown): z.output<T> {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new AppError("INVALID_INPUT", "Invalid input");
  return parsed.data;
}

const notFound = () =>
  new AppError("EXECUTION_PROJECT_NOT_FOUND", "Execution project not found");

// Products built from Go opportunities (docs/architecture/data-model.md#execution-and-revenue).
// The person records every number; the API writes them as manual, never as verified.
export function createExecutionService(deps: { database: Database }) {
  const { database } = deps;

  async function owned(userId: string, id: string) {
    if (!z.uuid().safeParse(id).success) throw notFound();
    const [project] = await database
      .select()
      .from(executionProjects)
      .where(
        and(eq(executionProjects.id, id), eq(executionProjects.userId, userId)),
      );
    if (!project) throw notFound();
    return project;
  }

  /** Starts the product of a Go opportunity; asking again returns the same project. */
  async function create(userId: string, body: unknown) {
    const input = parse(createSchema, body);
    const [opportunity] = await database
      .select({ status: opportunities.status, cluster: opportunities.cluster })
      .from(opportunities)
      .innerJoin(
        researchProjects,
        eq(opportunities.projectId, researchProjects.id),
      )
      .where(
        and(
          eq(opportunities.id, input.opportunityId),
          eq(researchProjects.userId, userId),
        ),
      );
    if (!opportunity)
      throw new AppError("OPPORTUNITY_NOT_FOUND", "Opportunity not found");
    if (opportunity.status !== "go")
      throw new AppError(
        "EXECUTION_NEEDS_GO",
        "Only a Go opportunity starts a product",
      );
    await database
      .insert(executionProjects)
      .values({
        userId,
        opportunityId: input.opportunityId,
        name: input.name ?? opportunity.cluster,
      })
      .onConflictDoNothing({ target: executionProjects.opportunityId });
    const [project] = await database
      .select()
      .from(executionProjects)
      .where(eq(executionProjects.opportunityId, input.opportunityId));
    return project;
  }

  async function list(userId: string, opportunityId?: string) {
    if (
      opportunityId !== undefined &&
      !z.uuid().safeParse(opportunityId).success
    )
      return [];
    return database
      .select()
      .from(executionProjects)
      .where(
        opportunityId
          ? and(
              eq(executionProjects.userId, userId),
              eq(executionProjects.opportunityId, opportunityId),
            )
          : eq(executionProjects.userId, userId),
      )
      .orderBy(desc(executionProjects.createdAt))
      .limit(MAX_ROWS);
  }

  async function get(userId: string, id: string) {
    const project = await owned(userId, id);
    const [events, revenue] = await Promise.all([
      database
        .select()
        .from(executionEvents)
        .where(eq(executionEvents.projectId, id))
        .orderBy(
          desc(executionEvents.periodStart),
          desc(executionEvents.createdAt),
        )
        .limit(MAX_ROWS),
      database
        .select()
        .from(revenueEvents)
        .where(eq(revenueEvents.projectId, id))
        .orderBy(desc(revenueEvents.occurredOn), desc(revenueEvents.createdAt))
        .limit(MAX_ROWS),
    ]);
    return { project, events, revenue };
  }

  /** A launched or measuring product needs its launch date. */
  async function update(userId: string, id: string, body: unknown) {
    const input = parse(updateSchema, body);
    const project = await owned(userId, id);
    const status = input.status ?? project.status;
    const launchedOn =
      input.launchedOn === undefined ? project.launchedOn : input.launchedOn;
    if (
      (LAUNCHED_STATUSES as readonly string[]).includes(status) &&
      !launchedOn
    )
      throw new AppError(
        "INVALID_INPUT",
        "A launched product needs a launch date",
      );
    const [updated] = await database
      .update(executionProjects)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(executionProjects.id, id))
      .returning();
    return updated;
  }

  async function addEvent(userId: string, id: string, body: unknown) {
    const input = parse(eventSchema, body);
    await owned(userId, id);
    const [event] = await database
      .insert(executionEvents)
      .values({ ...input, projectId: id, source: "manual" })
      .returning();
    return event;
  }

  async function addRevenue(userId: string, id: string, body: unknown) {
    const { gross, refund, fees, ...input } = parse(revenueSchema, body);
    await owned(userId, id);
    const [event] = await database
      .insert(revenueEvents)
      .values({
        ...input,
        projectId: id,
        grossMinor: gross,
        refundMinor: refund,
        feesMinor: fees ?? null,
        source: "manual",
      })
      .returning();
    return event;
  }

  /** Removes a mistyped manual record; imported and verified records stay. */
  async function remove(
    userId: string,
    id: string,
    kind: "events" | "revenue",
    recordId: string,
  ) {
    await owned(userId, id);
    const table = kind === "events" ? executionEvents : revenueEvents;
    const deleted = z.uuid().safeParse(recordId).success
      ? await database
          .delete(table)
          .where(
            and(
              eq(table.id, recordId),
              eq(table.projectId, id),
              eq(table.source, "manual"),
            ),
          )
          .returning({ id: table.id })
      : [];
    if (deleted.length === 0)
      throw new AppError("EXECUTION_RECORD_NOT_FOUND", "Record not found");
  }

  return { create, list, get, update, addEvent, addRevenue, remove };
}
