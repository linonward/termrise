// Rules for these tables: docs/architecture/data-model.md#execution-and-revenue
import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { createdAt, inList } from "./columns";
import { opportunities } from "./opportunities";

// docs/product/product.md#评分与状态
export const PRODUCT_STATUSES = [
  "not_started",
  "validating",
  "building",
  "launched",
  "measuring",
  "archived",
] as const;

// Where a number came from. Only a payment integration may write payment_verified.
export const DATA_SOURCES = ["manual", "imported", "payment_verified"] as const;

export const EXECUTION_METRICS = ["visitors", "activations"] as const;

// A product built from a Go opportunity: one per opportunity.
export const executionProjects = pgTable(
  "execution_projects",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text()
      .notNull()
      .references(() => user.id),
    /** Null once the research project is deleted; the product's record stays. */
    opportunityId: uuid().references(() => opportunities.id, {
      onDelete: "set null",
    }),
    name: text().notNull(),
    repoUrl: text(),
    domain: text(),
    launchedOn: date({ mode: "string" }),
    status: text({ enum: PRODUCT_STATUSES }).notNull().default("not_started"),
    createdAt: createdAt(),
    updatedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique("execution_projects_opportunity_unique").on(t.opportunityId),
    index("execution_projects_user_idx").on(t.userId, t.createdAt),
    check(
      "execution_projects_status_valid",
      sql`${t.status} in (${inList(PRODUCT_STATUSES)})`,
    ),
  ],
);

// Visitors and activations over a period, as the person counted them.
export const executionEvents = pgTable(
  "execution_events",
  {
    id: uuid().primaryKey().defaultRandom(),
    projectId: uuid()
      .notNull()
      .references(() => executionProjects.id, { onDelete: "cascade" }),
    metric: text({ enum: EXECUTION_METRICS }).notNull(),
    count: integer().notNull(),
    periodStart: date({ mode: "string" }).notNull(),
    periodEnd: date({ mode: "string" }).notNull(),
    source: text({ enum: DATA_SOURCES }).notNull(),
    note: text(),
    createdAt: createdAt(),
  },
  (t) => [
    index("execution_events_project_idx").on(t.projectId, t.periodStart),
    check(
      "execution_events_metric_valid",
      sql`${t.metric} in (${inList(EXECUTION_METRICS)})`,
    ),
    check(
      "execution_events_source_valid",
      sql`${t.source} in (${inList(DATA_SOURCES)})`,
    ),
    check(
      "execution_events_ranges",
      sql`${t.count} >= 0 and ${t.periodEnd} >= ${t.periodStart}`,
    ),
  ],
);

// Orders and money on one day, in minor units of one currency. Unknown fees stay null,
// never 0: net revenue is then unknown too. No card data.
export const revenueEvents = pgTable(
  "revenue_events",
  {
    id: uuid().primaryKey().defaultRandom(),
    projectId: uuid()
      .notNull()
      .references(() => executionProjects.id, { onDelete: "cascade" }),
    occurredOn: date({ mode: "string" }).notNull(),
    currency: text().notNull(),
    orders: integer().notNull(),
    grossMinor: integer().notNull(),
    refundMinor: integer().notNull().default(0),
    feesMinor: integer(),
    source: text({ enum: DATA_SOURCES }).notNull(),
    /** A payment or order ID, or a link, that backs the numbers. */
    evidence: text(),
    note: text(),
    createdAt: createdAt(),
  },
  (t) => [
    index("revenue_events_project_idx").on(t.projectId, t.occurredOn),
    check(
      "revenue_events_source_valid",
      sql`${t.source} in (${inList(DATA_SOURCES)})`,
    ),
    check(
      "revenue_events_ranges",
      sql`${t.orders} >= 0 and ${t.grossMinor} >= 0 and ${t.refundMinor} >= 0 and (${t.feesMinor} is null or ${t.feesMinor} >= 0) and ${t.currency} ~ '^[A-Z]{3}$'`,
    ),
  ],
);
