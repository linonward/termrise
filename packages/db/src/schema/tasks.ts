// Rules for these tables: docs/architecture/data-model.md
import { sql } from "drizzle-orm";
import {
  check,
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

export const TASK_STATUSES = ["PENDING", "SUCCEEDED", "FAILED"] as const;

// Example paid action (docs/architecture/data-model.md#tasks). Replace the
// input / output columns with the product's own fields.
export const tasks = pgTable(
  "tasks",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text()
      .notNull()
      .references(() => user.id),
    status: text({ enum: TASK_STATUSES }).notNull(),
    // Client-generated id: a retried request does not charge twice.
    requestId: uuid().notNull(),
    input: text().notNull(),
    output: text(),
    creditsCost: integer().notNull(),
    errorCode: text(),
    createdAt: createdAt(),
    completedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    index("tasks_user_id_idx").on(t.userId),
    index("tasks_created_at_idx").on(t.createdAt),
    unique("tasks_user_request_unique").on(t.userId, t.requestId),
    check("tasks_status_valid", sql`${t.status} in (${inList(TASK_STATUSES)})`),
    check("tasks_credits_cost_positive", sql`${t.creditsCost} > 0`),
  ],
);
