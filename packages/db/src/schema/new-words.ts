// New words (docs/product/keyword-pool.md#new-words): queries rising under root words in
// Google Trends, measured against a reference term and judged for a page.
import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  bigint,
  uuid,
} from "drizzle-orm/pg-core";

import { createdAt, inList } from "./columns";

export const NEW_WORD_VERDICTS = ["worth", "try", "skip"] as const;
export const NEW_WORD_BUILD = ["new_site", "inner_page"] as const;
export const NEW_WORD_CATEGORIES = [
  "ai",
  "game",
  "tool",
  "entertainment",
  "news",
  "shopping",
  "other",
] as const;

export const newWords = pgTable(
  "new_words",
  {
    id: uuid().primaryKey().defaultRandom(),
    /** Lower case, single spaces. */
    phrase: text().notNull().unique(),
    category: text({ enum: NEW_WORD_CATEGORIES }),
    /** The AI's three answers, in Chinese: what it is, what users want, what to build. */
    about: text(),
    userWants: text(),
    plan: text(),
    firstSeenAt: createdAt(),
    lastSeenAt: createdAt(),
    /** The latest daily curve (new-word-rules.ts CurveFacts.days). */
    curve: jsonb(),
    burstDay: date(),
    peakDay: date(),
    isNew: text({ enum: ["yes", "no"] }),
    fromZero: text({ enum: ["yes", "no"] }),
    rising: text({ enum: ["yes", "no"] }),
    preBurstShare: real(),
    /** Heat against the reference term on ratioDay. */
    ratio: real(),
    ratioDay: date(),
    searchVolume: integer(),
    keywordDifficulty: integer(),
    cpcMicros: bigint({ mode: "number" }),
    dedicatedPages: integer(),
    /** The top 20 and the page-one sites registered within NEW_SITE_DAYS. */
    serp: jsonb(),
    newSites: jsonb(),
    verdict: text({ enum: NEW_WORD_VERDICTS }),
    buildAs: text({ enum: NEW_WORD_BUILD }),
    reasons: jsonb()
      .notNull()
      .default(sql`'[]'::jsonb`),
    rules: text(),
    checkedAt: timestamp({ withTimezone: true }),
    nextCheckAt: timestamp({ withTimezone: true }),
    checks: integer().notNull().default(0),
    hiddenAt: timestamp({ withTimezone: true }),
    /** The maintainer chose to build for it (S62); a product starts with it. */
    selectedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    index("new_words_seen_idx").on(t.firstSeenAt),
    index("new_words_next_check_idx").on(t.nextCheckAt),
    check(
      "new_words_verdict_valid",
      sql`${t.verdict} is null or ${t.verdict} in (${inList(NEW_WORD_VERDICTS)})`,
    ),
  ],
);

// Which root words a new word rose under, and how much (Trends growth, percent).
export const newWordRoots = pgTable(
  "new_word_roots",
  {
    wordId: uuid()
      .notNull()
      .references(() => newWords.id, { onDelete: "cascade" }),
    root: text().notNull(),
    growth: integer(),
    seenAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.wordId, t.root] })],
);
