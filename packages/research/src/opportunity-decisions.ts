import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import type { Database } from "@repo/db/client";
import {
  DECISIONS,
  EXPERIMENT_KINDS,
  EXPERIMENT_STATUSES,
  opportunities,
  opportunityDecisions,
  opportunityEvaluations,
  researchProjects,
  validationExperiments,
} from "@repo/db/schema";
import { AppError } from "@repo/observability/errors";

import {
  NEXT_DECISIONS,
  NEXT_EXPERIMENT_STATUSES,
  REASON_MAX_LENGTH,
} from "./opportunity-rules";

const TEXT_MAX_LENGTH = 500;
const MAX_EXPERIMENTS = 20;

const text = z.string().trim().min(1).max(TEXT_MAX_LENGTH);
const decisionSchema = z.object({
  decision: z.enum(DECISIONS),
  reason: z.string().trim().min(1).max(REASON_MAX_LENGTH),
});
const experimentSchema = z.object({
  kind: z.enum(EXPERIMENT_KINDS),
  hypothesis: text,
  channel: text,
  metric: text,
  budgetUsd: z
    .number()
    .min(0)
    .max(10_000)
    .transform((usd) => Math.round(usd * 100) * 10_000),
  durationDays: z.number().int().min(1).max(365),
  successThreshold: text,
  stopCondition: text,
});
const resultSchema = z.object({
  status: z.enum(EXPERIMENT_STATUSES),
  resultNote: z.string().trim().max(REASON_MAX_LENGTH).optional(),
});

function parse<T extends z.ZodType>(schema: T, body: unknown): z.output<T> {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new AppError("INVALID_INPUT", "Invalid input");
  return parsed.data;
}

const notFound = () =>
  new AppError("OPPORTUNITY_NOT_FOUND", "Opportunity not found");
const isUuid = (id: string) => z.uuid().safeParse(id).success;

// Human decisions and validation experiments (docs/architecture/data-model.md#decisions-and-experiments).
export function createOpportunityDecisions(deps: { database: Database }) {
  const { database } = deps;
  type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

  /** Locks the user's opportunity row, so two decisions cannot race. */
  async function lockOwned(tx: Tx, userId: string, id: string) {
    if (!isUuid(id)) throw notFound();
    const [row] = await tx
      .select({ opportunity: opportunities })
      .from(opportunities)
      .innerJoin(
        researchProjects,
        eq(opportunities.projectId, researchProjects.id),
      )
      .where(and(eq(opportunities.id, id), eq(researchProjects.userId, userId)))
      .for("update", { of: opportunities });
    if (!row) throw notFound();
    return row.opportunity;
  }

  /** Appends a decision and sets the status; the current evaluation is its evidence. */
  async function decide(userId: string, opportunityId: string, body: unknown) {
    const input = parse(decisionSchema, body);
    return database.transaction(async (tx) => {
      const opportunity = await lockOwned(tx, userId, opportunityId);
      if (!NEXT_DECISIONS[opportunity.status].includes(input.decision))
        throw new AppError(
          "OPPORTUNITY_DECISION_INVALID",
          `Cannot decide ${input.decision} from ${opportunity.status}`,
        );
      const [evaluation] = await tx
        .select({ id: opportunityEvaluations.id })
        .from(opportunityEvaluations)
        .where(eq(opportunityEvaluations.opportunityId, opportunityId))
        .orderBy(
          desc(opportunityEvaluations.createdAt),
          desc(opportunityEvaluations.id),
        )
        .limit(1);
      const [decision] = await tx
        .insert(opportunityDecisions)
        .values({
          opportunityId,
          decision: input.decision,
          reason: input.reason,
          deciderId: userId,
          evaluationId: evaluation.id,
        })
        .returning();
      await tx
        .update(opportunities)
        .set({ status: input.decision, updatedAt: new Date() })
        .where(eq(opportunities.id, opportunityId));
      return decision;
    });
  }

  async function addExperiment(
    userId: string,
    opportunityId: string,
    body: unknown,
  ) {
    const input = parse(experimentSchema, body);
    return database.transaction(async (tx) => {
      await lockOwned(tx, userId, opportunityId);
      const existing = await tx
        .select({ id: validationExperiments.id })
        .from(validationExperiments)
        .where(eq(validationExperiments.opportunityId, opportunityId));
      if (existing.length >= MAX_EXPERIMENTS)
        throw new AppError("INVALID_INPUT", "Too many experiments");
      const { budgetUsd, ...fields } = input;
      const [experiment] = await tx
        .insert(validationExperiments)
        .values({ ...fields, opportunityId, budgetMicros: budgetUsd })
        .returning();
      return experiment;
    });
  }

  /** Moves an experiment on; a pass or fail needs a note on what was observed. */
  async function updateExperiment(
    userId: string,
    opportunityId: string,
    experimentId: string,
    body: unknown,
  ) {
    const input = parse(resultSchema, body);
    return database.transaction(async (tx) => {
      await lockOwned(tx, userId, opportunityId);
      const [experiment] = isUuid(experimentId)
        ? await tx
            .select()
            .from(validationExperiments)
            .where(
              and(
                eq(validationExperiments.id, experimentId),
                eq(validationExperiments.opportunityId, opportunityId),
              ),
            )
        : [];
      if (!experiment)
        throw new AppError("EXPERIMENT_NOT_FOUND", "Experiment not found");
      if (NEXT_EXPERIMENT_STATUSES[experiment.status].length === 0)
        throw new AppError("EXPERIMENT_FINISHED", "Experiment is finished");
      if (!NEXT_EXPERIMENT_STATUSES[experiment.status].includes(input.status))
        throw new AppError("INVALID_INPUT", "Invalid experiment status");
      if (
        (input.status === "passed" || input.status === "failed") &&
        !input.resultNote
      )
        throw new AppError("INVALID_INPUT", "A result needs a note");
      const [updated] = await tx
        .update(validationExperiments)
        .set({
          status: input.status,
          resultNote: input.resultNote || experiment.resultNote,
          updatedAt: new Date(),
        })
        .where(eq(validationExperiments.id, experimentId))
        .returning();
      return updated;
    });
  }

  return { decide, addExperiment, updateExperiment };
}
