// Rules for these tables: docs/architecture/data-model.md#opportunities
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { createdAt, inList } from "./columns";
import { researchRuns } from "./keywords";
import { researchProjects } from "./research";

// docs/product/product.md#评分与状态; the decision history is in opportunity_decisions.
export const OPPORTUNITY_STATUSES = [
  "unreviewed",
  "needs_validation",
  "go",
  "no_go",
] as const;

// A product opportunity: a cluster of a project's keywords, one row per cluster.
export const opportunities = pgTable(
  "opportunities",
  {
    id: uuid().primaryKey().defaultRandom(),
    projectId: uuid()
      .notNull()
      .references(() => researchProjects.id, { onDelete: "cascade" }),
    /** The cluster's name: its seed term (rule-based clustering v1). */
    cluster: text().notNull(),
    status: text({ enum: OPPORTUNITY_STATUSES })
      .notNull()
      .default("unreviewed"),
    createdAt: createdAt(),
    updatedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique("opportunities_project_cluster_unique").on(t.projectId, t.cluster),
    check(
      "opportunities_status_valid",
      sql`${t.status} in (${inList(OPPORTUNITY_STATUSES)})`,
    ),
  ],
);

export type OpportunityDimensions = {
  trend: number;
  demand: number;
  competition: number;
  commercial: number;
  mvp: number;
  distribution: number;
};

export type OpportunityEvidence = {
  keywordIds: string[];
  serpSnapshotIds: string[];
  signalIds: string[];
};

// One evaluation of an opportunity by one run, append-only: scores are versioned and can
// be recomputed. The newest evaluation is the current one.
export const opportunityEvaluations = pgTable(
  "opportunity_evaluations",
  {
    id: uuid().primaryKey().defaultRandom(),
    opportunityId: uuid()
      .notNull()
      .references(() => opportunities.id, { onDelete: "cascade" }),
    runId: uuid()
      .notNull()
      .references(() => researchRuns.id, { onDelete: "cascade" }),
    scoringVersion: text().notNull(),
    score: integer().notNull(),
    dimensions: jsonb().$type<OpportunityDimensions>().notNull(),
    confidence: integer().notNull(),
    needsReview: boolean().notNull(),
    /** Rank among the project's opportunities in this run, 1 = best. */
    rank: integer().notNull(),
    /** The analyst's hypotheses; null when its output failed validation. */
    analysis: jsonb().$type<Record<string, unknown>>(),
    analysisError: text(),
    analystProvider: text().notNull(),
    /** The model the analyst used; null for the fake analyst. */
    analystModel: text(),
    analystPromptVersion: text().notNull(),
    evidence: jsonb().$type<OpportunityEvidence>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("opportunity_evaluations_opportunity_idx").on(
      t.opportunityId,
      t.createdAt,
    ),
    check(
      "opportunity_evaluations_ranges",
      sql`${t.score} between 0 and 100 and ${t.confidence} between 0 and 100 and ${t.rank} >= 1`,
    ),
  ],
);

// Decisions a person makes; never set by AI or by a score.
export const DECISIONS = ["needs_validation", "go", "no_go"] as const;

// The decision history, append-only: each row sets the opportunity's status
// (docs/architecture/data-model.md#decisions-and-experiments).
export const opportunityDecisions = pgTable(
  "opportunity_decisions",
  {
    id: uuid().primaryKey().defaultRandom(),
    opportunityId: uuid()
      .notNull()
      .references(() => opportunities.id, { onDelete: "cascade" }),
    decision: text({ enum: DECISIONS }).notNull(),
    reason: text().notNull(),
    deciderId: text()
      .notNull()
      .references(() => user.id),
    /** The evidence version: the evaluation that was current when deciding. */
    evaluationId: uuid()
      .notNull()
      .references(() => opportunityEvaluations.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("opportunity_decisions_opportunity_idx").on(
      t.opportunityId,
      t.createdAt,
    ),
    check(
      "opportunity_decisions_decision_valid",
      sql`${t.decision} in (${inList(DECISIONS)})`,
    ),
  ],
);

// docs/product/product.md#f06-无访谈验证
export const EXPERIMENT_KINDS = [
  "review_analysis",
  "free_tool",
  "landing_smoke_test",
  "sample_paid_upgrade",
  "paid_pilot",
] as const;
export const EXPERIMENT_STATUSES = [
  "planned",
  "running",
  "passed",
  "failed",
  "stopped",
] as const;

// A validation experiment without interviews. The result is what the person records.
export const validationExperiments = pgTable(
  "validation_experiments",
  {
    id: uuid().primaryKey().defaultRandom(),
    opportunityId: uuid()
      .notNull()
      .references(() => opportunities.id, { onDelete: "cascade" }),
    kind: text({ enum: EXPERIMENT_KINDS }).notNull(),
    hypothesis: text().notNull(),
    channel: text().notNull(),
    /** The event that is counted, e.g. a paid order. */
    metric: text().notNull(),
    budgetMicros: integer().notNull(),
    durationDays: integer().notNull(),
    successThreshold: text().notNull(),
    stopCondition: text().notNull(),
    status: text({ enum: EXPERIMENT_STATUSES }).notNull().default("planned"),
    resultNote: text(),
    createdAt: createdAt(),
    updatedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("validation_experiments_opportunity_idx").on(
      t.opportunityId,
      t.createdAt,
    ),
    check(
      "validation_experiments_kind_valid",
      sql`${t.kind} in (${inList(EXPERIMENT_KINDS)})`,
    ),
    check(
      "validation_experiments_status_valid",
      sql`${t.status} in (${inList(EXPERIMENT_STATUSES)})`,
    ),
    check(
      "validation_experiments_ranges",
      sql`${t.budgetMicros} >= 0 and ${t.durationDays} between 1 and 365`,
    ),
  ],
);
