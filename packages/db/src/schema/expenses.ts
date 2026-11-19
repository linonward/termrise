// Rules for this table: docs/architecture/data-model.md#expenses
import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  pgTable,
  text,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { createdAt, inList } from "./columns";

export const EXPENSE_CATEGORIES = [
  "domain",
  "hosting",
  "data",
  "ai",
  "tool",
  "other",
] as const;

// Money the maintainer paid outside the API ledger (S81): domain renewals, hosting,
// data top-ups, subscriptions. One row per payment; written in the app or by an agent.
export const expenses = pgTable(
  "expenses",
  {
    id: uuid().primaryKey().defaultRandom(),
    paidOn: date().notNull(),
    /** In the currency's minor unit (cents). */
    amountMinor: integer().notNull(),
    /** ISO 4217, upper case. */
    currency: text().notNull(),
    category: text({ enum: EXPENSE_CATEGORIES }).notNull(),
    note: text().notNull().default(""),
    /** The domain a renewal was for, when there is one. */
    domain: text(),
    createdBy: text().references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("expenses_paid_on_idx").on(t.paidOn),
    check("expenses_amount_positive", sql`${t.amountMinor} > 0`),
    check("expenses_currency_valid", sql`${t.currency} ~ '^[A-Z]{3}$'`),
    check(
      "expenses_category_valid",
      sql`${t.category} in (${inList(EXPENSE_CATEGORIES)})`,
    ),
  ],
);
