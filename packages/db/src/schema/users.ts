// Rules for these tables: docs/architecture/data-model.md
import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { user } from "./auth";

// Analytics consent from the cookie banner; server-side events go only to users with granted = true.
export const analyticsConsents = pgTable("analytics_consents", {
  userId: text()
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  granted: boolean().notNull(),
  updatedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
});
