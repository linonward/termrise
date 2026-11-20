// Watched sites (docs/product/keyword-pool.md#site-watch): sections of other sites whose
// new pages hint at new searches, such as imagelayered.com/tools/ (S83).
import { sql } from "drizzle-orm";
import {
  boolean,
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

/** How a section's pages are read: its RSS or Atom feed, the sitemap, or the links on it. */
export const WATCH_METHODS = ["feed", "sitemap", "links"] as const;
/**
 * signal: its new pages become new words. confirm: only cross-checks, a signal page's
 * phrase found here too (new or old) makes the word hotter (S84).
 */
export const WATCH_ROLES = ["signal", "confirm"] as const;

export const watchSources = pgTable(
  "watch_sources",
  {
    id: uuid().primaryKey().defaultRandom(),
    /** The section's address, https, without query or fragment, ending in "/". */
    prefix: text().notNull().unique(),
    /** Found on the first scan; null until then. */
    method: text({ enum: WATCH_METHODS }),
    role: text({ enum: WATCH_ROLES }).notNull().default("signal"),
    /** Where the pages are read: the feed, or the sitemaps that list the section. */
    readFrom: text()
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    /** When the first scan recorded the pages already there (not new). */
    baselineAt: timestamp({ withTimezone: true }),
    lastCheckedAt: timestamp({ withTimezone: true }),
    lastError: text(),
    pagesKnown: integer().notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    check(
      "watch_sources_role_valid",
      sql`${t.role} in (${inList(WATCH_ROLES)})`,
    ),
    check(
      "watch_sources_method_valid",
      sql`${t.method} is null or ${t.method} in (${inList(WATCH_METHODS)})`,
    ),
  ],
);

export const watchPages = pgTable(
  "watch_pages",
  {
    id: uuid().primaryKey().defaultRandom(),
    sourceId: uuid()
      .notNull()
      .references(() => watchSources.id, { onDelete: "cascade" }),
    url: text().notNull(),
    title: text(),
    /** The page's date as the source gives it (feed date or sitemap lastmod). */
    publishedAt: timestamp({ withTimezone: true }),
    firstSeenAt: createdAt(),
    /** There before the first scan: not a new page. */
    baseline: boolean().notNull().default(false),
    /** The search phrase the page targets, from its address or title. */
    phrase: text(),
    /** When the phrase was handed to the new words' discovery. */
    sentAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    unique("watch_pages_source_url").on(t.sourceId, t.url),
    index("watch_pages_first_seen_idx").on(t.firstSeenAt),
    index("watch_pages_phrase_idx").on(t.phrase),
  ],
);
