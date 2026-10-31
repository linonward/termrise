// The keyword pool (docs/product/keyword-pool.md): every keyword checked for a tool site,
// its latest verdict and when to look again, with each check kept.
import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { createdAt, inList } from "./columns";

// new: added, not checked. queued: passed screening, waits for a deep check.
// candidate: passed every automatic limit. watch: rising fast, looked at daily.
// selected / dropped: the maintainer's decision.
export const POOL_STATUSES = [
  "new",
  "queued",
  "candidate",
  "unsure",
  "watch",
  "failed",
  "excluded",
  "selected",
  "dropped",
] as const;
export const POOL_CHECK_KINDS = ["screen", "deep", "review", "import"] as const;
// new_words: one day's discovery and checks of new words (new-words.ts).
export const POOL_ROUND_KINDS = ["daily", "manual", "new_words"] as const;
export const POOL_ROUND_STATUSES = [
  "queued",
  "running",
  "completed",
  "partial",
  "failed",
  "budget_exhausted",
] as const;

export const poolRounds = pgTable(
  "pool_rounds",
  {
    id: uuid().primaryKey().defaultRandom(),
    kind: text({ enum: POOL_ROUND_KINDS }).notNull(),
    /** suffix:<seed> or ranked:<site>; null lets the round pick the next source. */
    source: text(),
    status: text({ enum: POOL_ROUND_STATUSES }).notNull().default("queued"),
    requestedBy: text().references(() => user.id, { onDelete: "set null" }),
    errorCode: text(),
    /** What the round found, for the daily report (pool-round.ts). */
    report: jsonb(),
    createdAt: createdAt(),
    claimedAt: timestamp({ withTimezone: true }),
    finishedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    index("pool_rounds_created_idx").on(t.createdAt),
    check(
      "pool_rounds_kind_valid",
      sql`${t.kind} in (${inList(POOL_ROUND_KINDS)})`,
    ),
    check(
      "pool_rounds_status_valid",
      sql`${t.status} in (${inList(POOL_ROUND_STATUSES)})`,
    ),
  ],
);

export const poolKeywords = pgTable(
  "pool_keywords",
  {
    id: uuid().primaryKey().defaultRandom(),
    /** Lower case, single spaces. */
    phrase: text().notNull().unique(),
    /** Where the keyword came from: suffix:<seed>, ranked:<site>, gsc:<site>, idea. */
    sources: text()
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    status: text({ enum: POOL_STATUSES }).notNull().default("new"),
    /** The latest check's reasons (pool-rules.ts Reason[]). */
    reasons: jsonb()
      .notNull()
      .default(sql`'[]'::jsonb`),
    searchVolume: integer(),
    keywordDifficulty: integer(),
    cpcMicros: bigint({ mode: "number" }),
    /** Other phrasings with the same data (S1 grouping). */
    variants: text()
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    variantCount: integer(),
    strongCompetitors: integer(),
    innerPages: integer(),
    /** The latest H6 result (pool-trend.ts TrendCheck). */
    trend: jsonb(),
    /** The maintainer's answers: H4, H7 and the AI angle (S4). */
    monetization: text(),
    compliance: text(),
    aiAngle: text(),
    firstSeenAt: createdAt(),
    lastCheckedAt: timestamp({ withTimezone: true }),
    nextCheckAt: timestamp({ withTimezone: true }),
    updatedAt: createdAt(),
  },
  (t) => [
    index("pool_keywords_status_idx").on(t.status),
    index("pool_keywords_next_check_idx").on(t.nextCheckAt),
    check(
      "pool_keywords_status_valid",
      sql`${t.status} in (${inList(POOL_STATUSES)})`,
    ),
  ],
);

// Append-only: one row per screening, deep check, review or import.
export const poolChecks = pgTable(
  "pool_checks",
  {
    id: uuid().primaryKey().defaultRandom(),
    keywordId: uuid()
      .notNull()
      .references(() => poolKeywords.id, { onDelete: "cascade" }),
    roundId: uuid().references(() => poolRounds.id, { onDelete: "set null" }),
    kind: text({ enum: POOL_CHECK_KINDS }).notNull(),
    status: text({ enum: POOL_STATUSES }).notNull(),
    reasons: jsonb()
      .notNull()
      .default(sql`'[]'::jsonb`),
    /** The data behind the verdict: metrics, trend, SERP summary, review note. */
    data: jsonb()
      .notNull()
      .default(sql`'{}'::jsonb`),
    rules: text().notNull(),
    reviewerId: text().references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("pool_checks_keyword_idx").on(t.keywordId, t.createdAt),
    check(
      "pool_checks_kind_valid",
      sql`${t.kind} in (${inList(POOL_CHECK_KINDS)})`,
    ),
    check(
      "pool_checks_status_valid",
      sql`${t.status} in (${inList(POOL_STATUSES)})`,
    ),
  ],
);
