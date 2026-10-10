// Rules for this table: docs/architecture/data-model.md#worker-heartbeats
import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";

// What each worker process runs with, written at start and every minute, so the API can
// show the services without reading the worker's environment. No secrets.
export const workerHeartbeats = pgTable("worker_heartbeats", {
  workerId: text().primaryKey(),
  keywordProvider: text().notNull(),
  analystProvider: text().notNull(),
  analystModel: text(),
  radarEnabled: boolean().notNull(),
  startedAt: timestamp({ withTimezone: true }).notNull(),
  lastSeenAt: timestamp({ withTimezone: true }).notNull(),
});
