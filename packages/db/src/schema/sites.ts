// Rules for these tables: docs/architecture/data-model.md#sites
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import { inList } from "./columns";

// The maintainer's live websites, copied from site-ops every 15 minutes (S79). site-ops's
// site list stays the source; a site that leaves it gets removedAt here.
export const sites = pgTable("sites", {
  domain: text().primaryKey(),
  name: text().notNull(),
  /** site-ops kind: tool, web, gefeisites, other. */
  kind: text().notNull(),
  /** tool-starter or web-starter when the site follows a template. */
  template: text(),
  /** Local repository folder under the workspace. */
  repo: text(),
  pvuvSiteId: text(),
  /** Uptime over the last 24 hours, as site-ops reported it. */
  checks24h: integer().notNull().default(0),
  up24h: integer().notNull().default(0),
  avgMs24h: integer(),
  lastCheckAt: timestamp({ withTimezone: true }),
  lastStatus: integer(),
  lastOk: boolean(),
  /** site-ops's alert state: down after two failed checks in a row. */
  alertState: text({ enum: ["up", "down"] }),
  alertSince: timestamp({ withTimezone: true }),
  syncedAt: timestamp({ withTimezone: true }).notNull(),
  removedAt: timestamp({ withTimezone: true }),
});

export const SITE_METRIC_SOURCES = ["pvuv", "gsc", "admin"] as const;
export type SiteMetricSource = (typeof SITE_METRIC_SOURCES)[number];

// One row per site, day and source, as site-ops stored it each day: pvuv's overview of
// the day, Search Console's 28-day totals, the tool site's admin metrics.
export const siteDailyMetrics = pgTable(
  "site_daily_metrics",
  {
    domain: text()
      .notNull()
      .references(() => sites.domain, { onDelete: "cascade" }),
    day: date({ mode: "string" }).notNull(),
    source: text({ enum: SITE_METRIC_SOURCES }).notNull(),
    data: jsonb().notNull(),
    fetchedAt: timestamp({ withTimezone: true }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.domain, t.day, t.source] }),
    check(
      "site_daily_metrics_source_valid",
      sql`${t.source} in (${inList(SITE_METRIC_SOURCES)})`,
    ),
  ],
);

// Machines that report to site-ops by heartbeat (the local workbench itself).
export const opsHeartbeats = pgTable("ops_heartbeats", {
  source: text().primaryKey(),
  state: text({ enum: ["up", "down"] }).notNull(),
  reason: text().notNull(),
  syncedAt: timestamp({ withTimezone: true }).notNull(),
});

// Registration of each registrable domain the sites use (S81), read from RDAP once a day.
// vivclip.com and radio.vivclip.com share one row.
export const domains = pgTable("domains", {
  domain: text().primaryKey(),
  expiresAt: timestamp({ withTimezone: true }),
  registrar: text(),
  checkedAt: timestamp({ withTimezone: true }).notNull(),
  /** Why the last lookup failed (http status or "no expiration"); null when it worked. */
  error: text(),
});
