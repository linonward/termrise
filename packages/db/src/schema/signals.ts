// Rules for these tables: docs/architecture/data-model.md#source-signals
import { sql } from "drizzle-orm";
import {
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { inList } from "./columns";
import { researchProjects } from "./research";

export const SIGNAL_PROVIDERS = ["csv"] as const;

// Where a term was observed (docs/product/product.md#f01-热词发现). One row per observation;
// re-importing the same row is a no-op. Scoped to a research project for now; global
// signals (Hacker News, Google Trends) come with Radar.
export const sourceSignals = pgTable(
  "source_signals",
  {
    id: uuid().primaryKey().defaultRandom(),
    projectId: uuid()
      .notNull()
      .references(() => researchProjects.id, { onDelete: "cascade" }),
    provider: text({ enum: SIGNAL_PROVIDERS }).notNull(),
    // Provider id, or for CSV a hash of the normalized row.
    externalId: text().notNull(),
    url: text(),
    rawTitle: text().notNull(),
    normalizedTerm: text().notNull(),
    // When the source saw the term; null when the source does not say.
    observedAt: timestamp({ withTimezone: true }),
    ingestedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    metadata: jsonb().$type<Record<string, string>>().notNull().default({}),
  },
  (t) => [
    unique("source_signals_project_provider_external_unique").on(
      t.projectId,
      t.provider,
      t.externalId,
    ),
    index("source_signals_project_term_idx").on(t.projectId, t.normalizedTerm),
    check(
      "source_signals_provider_valid",
      sql`${t.provider} in (${inList(SIGNAL_PROVIDERS)})`,
    ),
  ],
);
