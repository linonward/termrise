// Rules for these tables: docs/architecture/data-model.md#research-projects
import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { createdAt, inList } from "./columns";

// docs/product/product.md#评分与状态; only ResearchService changes it.
export const RESEARCH_STATUSES = [
  "draft",
  "collecting",
  "expanding",
  "enriching",
  "clustering",
  "auditing",
  "evaluating",
  "completed",
  "partial",
  "failed",
  "cancelled",
  "budget_exhausted",
] as const;

// A research project: seed terms in one market, with budgets for paid data and AI calls.
// Budgets are whole micro-USD (1 USD = 1,000,000), like the ledger's whole numbers.
export const researchProjects = pgTable(
  "research_projects",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text()
      .notNull()
      .references(() => user.id),
    name: text().notNull(),
    // DataForSEO location and language codes, e.g. 2840 / en (United States, English).
    locationCode: integer().notNull(),
    languageCode: text().notNull(),
    seeds: text().array().notNull(),
    dataBudgetMicros: bigint({ mode: "number" }).notNull(),
    aiBudgetMicros: bigint({ mode: "number" }).notNull(),
    status: text({ enum: RESEARCH_STATUSES }).notNull().default("draft"),
    createdAt: createdAt(),
    updatedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("research_projects_user_created_idx").on(t.userId, t.createdAt),
    check(
      "research_projects_status_valid",
      sql`${t.status} in (${inList(RESEARCH_STATUSES)})`,
    ),
    check(
      "research_projects_name_length",
      sql`char_length(${t.name}) between 1 and 100`,
    ),
    check(
      "research_projects_seeds_count",
      sql`cardinality(${t.seeds}) between 1 and 50`,
    ),
    check(
      "research_projects_budgets_non_negative",
      sql`${t.dataBudgetMicros} >= 0 and ${t.aiBudgetMicros} >= 0`,
    ),
  ],
);
