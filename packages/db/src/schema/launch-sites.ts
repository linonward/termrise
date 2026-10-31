// Launch sites (docs/product/keyword-pool.md#launch-sites): new websites their makers
// posted, such as Show HN, with what the maker said and what it is for.
import { sql } from "drizzle-orm";
import {
  boolean,
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

import { createdAt, inList } from "./columns";

export const LAUNCH_SOURCES = ["hacker_news"] as const;
/** Why the maker built it: from their words when they say, else inferred. */
export const LAUNCH_MOTIVES = [
  "keyword",
  "own_pain",
  "others_need",
  "hobby",
  "business",
  "unstated",
] as const;

export const launchSites = pgTable(
  "launch_sites",
  {
    id: uuid().primaryKey().defaultRandom(),
    source: text({ enum: LAUNCH_SOURCES }).notNull(),
    /** The post's id at the source, e.g. the HN item id. */
    sourceId: text().notNull(),
    sourceUrl: text().notNull(),
    /** Host without www, e.g. cursedcam.com or name.github.io. */
    site: text().notNull(),
    url: text().notNull(),
    postTitle: text().notNull(),
    /** The post's own text and the maker's first replies, plain text, capped. */
    makerWords: text(),
    score: integer(),
    comments: integer(),
    postedAt: timestamp({ withTimezone: true }),
    registeredOn: date(),
    pageTitle: text(),
    /** The AI's reading, in Chinese (launch-site-analyst.ts). */
    category: text(),
    motive: text({ enum: LAUNCH_MOTIVES }),
    /** True when the maker says why; false when the reason is inferred. */
    stated: boolean(),
    about: text(),
    audience: text(),
    why: text(),
    coreKeyword: text(),
    keywordNote: text(),
    monetization: text(),
    analyzedAt: timestamp({ withTimezone: true }),
    firstSeenAt: createdAt(),
    hiddenAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    unique("launch_sites_source_unique").on(t.source, t.sourceId),
    index("launch_sites_posted_idx").on(t.postedAt),
    index("launch_sites_site_idx").on(t.site),
    check(
      "launch_sites_motive_valid",
      sql`${t.motive} is null or ${t.motive} in (${inList(LAUNCH_MOTIVES)})`,
    ),
  ],
);
