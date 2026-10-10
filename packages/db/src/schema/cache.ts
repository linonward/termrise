// Rules for this table: docs/architecture/data-model.md#provider-cache
import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

// Paid provider answers kept for reuse: the same request within its time to live is not
// paid again. Market data only, shared by all users; no user data.
export const providerCache = pgTable(
  "provider_cache",
  {
    // SHA-256 of provider, operation, market and parameters.
    key: text().primaryKey(),
    provider: text().notNull(),
    operation: text().notNull(),
    value: jsonb().notNull(),
    fetchedAt: timestamp({ withTimezone: true }).notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
  },
  (t) => [index("provider_cache_expires_idx").on(t.expiresAt)],
);
