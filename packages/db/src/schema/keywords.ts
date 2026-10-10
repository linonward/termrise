// Rules for these tables: docs/architecture/data-model.md#research-runs-and-keywords
import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { createdAt, inList } from "./columns";
import { researchProjects } from "./research";

// pending: queued for the worker (docs/architecture/jobs.md).
export const RUN_STATUSES = [
  "pending",
  "running",
  "completed",
  "partial",
  "failed",
] as const;
export const KEYWORD_SOURCES = ["seed", "expansion"] as const;
export const KEYWORD_PROVIDERS = ["fake"] as const;

// One run of a research project's stages. requestId makes a retried request start one run.
export const researchRuns = pgTable(
  "research_runs",
  {
    id: uuid().primaryKey().defaultRandom(),
    projectId: uuid()
      .notNull()
      .references(() => researchProjects.id, { onDelete: "cascade" }),
    requestId: uuid().notNull(),
    status: text({ enum: RUN_STATUSES }).notNull(),
    /** The stage running now, or the last one reached. */
    stage: text().notNull(),
    errorCode: text(),
    startedAt: createdAt(),
    finishedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    unique("research_runs_project_request_unique").on(t.projectId, t.requestId),
    index("research_runs_project_idx").on(t.projectId, t.startedAt),
    check(
      "research_runs_status_valid",
      sql`${t.status} in (${inList(RUN_STATUSES)})`,
    ),
  ],
);

// A keyword of a project: a seed, or found by expanding one. One row per phrase.
export const keywords = pgTable(
  "keywords",
  {
    id: uuid().primaryKey().defaultRandom(),
    projectId: uuid()
      .notNull()
      .references(() => researchProjects.id, { onDelete: "cascade" }),
    runId: uuid()
      .notNull()
      .references(() => researchRuns.id, { onDelete: "cascade" }),
    phrase: text().notNull(),
    source: text({ enum: KEYWORD_SOURCES }).notNull(),
    /** The seed this keyword was expanded from; the phrase itself for a seed. */
    seed: text().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique("keywords_project_phrase_unique").on(t.projectId, t.phrase),
    check(
      "keywords_source_valid",
      sql`${t.source} in (${inList(KEYWORD_SOURCES)})`,
    ),
  ],
);

// Metrics as the provider reported them, append-only. Null is "no data", never 0.
export const keywordMetricSnapshots = pgTable(
  "keyword_metric_snapshots",
  {
    id: uuid().primaryKey().defaultRandom(),
    keywordId: uuid()
      .notNull()
      .references(() => keywords.id, { onDelete: "cascade" }),
    provider: text({ enum: KEYWORD_PROVIDERS }).notNull(),
    /** Average monthly searches. */
    searchVolume: integer(),
    /** Cost per click in micro-USD. */
    cpcMicros: bigint({ mode: "number" }),
    /** Google Ads competition, 0–100. Not the SEO difficulty. */
    adsCompetition: integer(),
    /** SEO keyword difficulty, 0–100. */
    keywordDifficulty: integer(),
    fetchedAt: createdAt(),
  },
  (t) => [
    index("keyword_metric_snapshots_keyword_idx").on(t.keywordId, t.fetchedAt),
    check(
      "keyword_metric_snapshots_ranges",
      sql`(${t.searchVolume} is null or ${t.searchVolume} >= 0)
        and (${t.cpcMicros} is null or ${t.cpcMicros} >= 0)
        and (${t.adsCompetition} is null or ${t.adsCompetition} between 0 and 100)
        and (${t.keywordDifficulty} is null or ${t.keywordDifficulty} between 0 and 100)`,
    ),
  ],
);

// The top organic results of one keyword at one time.
export const serpSnapshots = pgTable(
  "serp_snapshots",
  {
    id: uuid().primaryKey().defaultRandom(),
    keywordId: uuid()
      .notNull()
      .references(() => keywords.id, { onDelete: "cascade" }),
    provider: text({ enum: KEYWORD_PROVIDERS }).notNull(),
    device: text().notNull(),
    locationCode: integer().notNull(),
    languageCode: text().notNull(),
    fetchedAt: createdAt(),
  },
  (t) => [index("serp_snapshots_keyword_idx").on(t.keywordId, t.fetchedAt)],
);

export const serpResults = pgTable(
  "serp_results",
  {
    id: uuid().primaryKey().defaultRandom(),
    snapshotId: uuid()
      .notNull()
      .references(() => serpSnapshots.id, { onDelete: "cascade" }),
    rank: integer().notNull(),
    url: text().notNull(),
    title: text().notNull(),
    /** Result type as the provider names it, e.g. organic. */
    type: text().notNull(),
  },
  (t) => [
    unique("serp_results_snapshot_rank_unique").on(t.snapshotId, t.rank),
    check("serp_results_rank_positive", sql`${t.rank} >= 1`),
  ],
);
