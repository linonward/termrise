// Platform sites (docs/product/keyword-pool.md#platform-sites): sites on free hosting
// platforms (vercel.app, github.io, pages.dev) that get Google organic traffic. A
// subdomain there carries no authority of its own, so one that ranks points to a weak
// search result.
import {
  index,
  integer,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { createdAt } from "./columns";

export const PLATFORMS = ["vercel.app", "github.io", "pages.dev"] as const;

export const platformSites = pgTable(
  "platform_sites",
  {
    id: uuid().primaryKey().defaultRandom(),
    /** e.g. name.vercel.app; lower case. */
    host: text().notNull().unique(),
    platform: text({ enum: PLATFORMS }).notNull(),
    /** The Common Crawl collection it first appeared in, e.g. CC-MAIN-2026-43. */
    firstCrawl: text().notNull(),
    firstSeenAt: createdAt(),
    /** The latest estimate of monthly Google organic visits (DataForSEO). */
    etv: real(),
    checkedAt: timestamp({ withTimezone: true }),
    /** The biggest keyword it ranks for on page one, else the biggest it ranks for. */
    topKeyword: text(),
    topKeywordVolume: integer(),
    topKeywordRank: integer(),
    /** When its keywords were looked up; set even when none were found. */
    keywordCheckedAt: timestamp({ withTimezone: true }),
    pageTitle: text(),
    titleCheckedAt: timestamp({ withTimezone: true }),
    hiddenAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    index("platform_sites_etv_idx").on(t.etv),
    index("platform_sites_checked_idx").on(t.checkedAt),
  ],
);

// One estimate per site and month (YYYY-MM): the months fill in as checks repeat.
export const platformSiteMonths = pgTable(
  "platform_site_months",
  {
    siteId: uuid()
      .notNull()
      .references(() => platformSites.id, { onDelete: "cascade" }),
    month: text().notNull(),
    etv: real().notNull(),
    measuredAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.siteId, t.month] })],
);

// How far each platform has been read in a Common Crawl collection.
export const platformCrawls = pgTable(
  "platform_crawls",
  {
    collection: text().notNull(),
    platform: text({ enum: PLATFORMS }).notNull(),
    pages: integer().notNull(),
    nextPage: integer().notNull().default(0),
    updatedAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.collection, t.platform] })],
);
