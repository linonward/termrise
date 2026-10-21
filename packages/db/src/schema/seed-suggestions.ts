// Rules for this table: docs/architecture/data-model.md#seed-suggestions
import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { createdAt, inList } from "./columns";
import { researchProjects } from "./research";

// pending: queued for the worker; running: claimed by it.
export const SEED_SUGGESTION_STATUSES = [
  "pending",
  "running",
  "completed",
  "failed",
] as const;

// Short search phrases an AI suggests for a project's seeds (e.g. a whole story title).
// The user reviews them and saves them as seeds; a suggestion never changes the project.
export const seedSuggestions = pgTable(
  "seed_suggestions",
  {
    id: uuid().primaryKey().defaultRandom(),
    projectId: uuid()
      .notNull()
      .references(() => researchProjects.id, { onDelete: "cascade" }),
    requestId: uuid().notNull(),
    status: text({ enum: SEED_SUGGESTION_STATUSES }).notNull(),
    /** The seeds the suggestion is for, as they were when it was asked for. */
    sourceSeeds: text().array().notNull(),
    /** Normalized phrases; null until completed. */
    phrases: text().array(),
    errorCode: text(),
    provider: text(),
    model: text(),
    promptVersion: text(),
    createdAt: createdAt(),
    claimedAt: timestamp({ withTimezone: true }),
    finishedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    unique("seed_suggestions_project_request_unique").on(
      t.projectId,
      t.requestId,
    ),
    index("seed_suggestions_project_idx").on(t.projectId, t.createdAt),
    index("seed_suggestions_status_idx").on(t.status),
    check(
      "seed_suggestions_status_valid",
      sql`${t.status} in (${inList(SEED_SUGGESTION_STATUSES)})`,
    ),
  ],
);
