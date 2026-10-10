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
