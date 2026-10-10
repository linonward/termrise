// Rules for this table: docs/architecture/data-model.md#worker-heartbeats
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

// What each worker process runs with, written at start and every minute, so the API can
// show the services without reading the worker's environment. No secrets.
export const workerHeartbeats = pgTable("worker_heartbeats", {
  workerId: text().primaryKey(),
  keywordProvider: text().notNull(),
  analystProvider: text().notNull(),
  analystModel: text(),
  /** Radar sources it collects, e.g. hacker_news; empty when the radar is off. */
  radarSources: text().array().notNull().default([]),
  startedAt: timestamp({ withTimezone: true }).notNull(),
  lastSeenAt: timestamp({ withTimezone: true }).notNull(),
});
