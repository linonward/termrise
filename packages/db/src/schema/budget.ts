// Rules for this table: docs/architecture/data-model.md#budget-ledger
import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { createdAt, inList } from "./columns";
import { researchRuns } from "./keywords";
import { poolRounds } from "./pool";
import { researchProjects } from "./research";

export const BUDGET_KINDS = ["data", "ai"] as const;
// reserved: the call is out; settled: the provider reported its cost; failed: the call
// failed and its cost is unknown, so the reservation stays counted.
// released: the provider refused the credentials and billed nothing.
export const USAGE_STATUSES = [
  "reserved",
  "settled",
  "failed",
  "released",
] as const;

// One paid provider call: reserved from a project's budget, or from the keyword pool's
// daily budget for a pool round, before; settled after.
export const apiUsage = pgTable(
  "api_usage",
  {
    id: uuid().primaryKey().defaultRandom(),
    projectId: uuid().references(() => researchProjects.id, {
      onDelete: "cascade",
    }),
    poolRoundId: uuid().references(() => poolRounds.id, {
      onDelete: "cascade",
    }),
    runId: uuid().references(() => researchRuns.id, { onDelete: "cascade" }),
    kind: text({ enum: BUDGET_KINDS }).notNull(),
    provider: text().notNull(),
    operation: text().notNull(),
    reservedMicros: bigint({ mode: "number" }).notNull(),
    costMicros: bigint({ mode: "number" }),
    status: text({ enum: USAGE_STATUSES }).notNull().default("reserved"),
    createdAt: createdAt(),
    settledAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    index("api_usage_project_idx").on(t.projectId, t.kind),
    index("api_usage_pool_idx").on(t.poolRoundId, t.createdAt),
    check(
      "api_usage_one_owner",
      sql`(${t.projectId} is null) <> (${t.poolRoundId} is null)`,
    ),
    check("api_usage_kind_valid", sql`${t.kind} in (${inList(BUDGET_KINDS)})`),
    check(
      "api_usage_status_valid",
      sql`${t.status} in (${inList(USAGE_STATUSES)})`,
    ),
    check(
      "api_usage_amounts",
      sql`${t.reservedMicros} >= 0 and (${t.costMicros} is null or ${t.costMicros} >= 0)`,
    ),
  ],
);
