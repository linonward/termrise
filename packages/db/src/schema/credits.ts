// Rules for these tables: docs/architecture/data-model.md
import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  text,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { createdAt, inList } from "./columns";
import { purchases, subscriptions } from "./orders";
import { tasks } from "./tasks";

export const CREDIT_TRANSACTION_TYPES = [
  "SIGNUP_BONUS",
  "PURCHASE",
  "PURCHASE_REVERSAL",
  "TASK_DEBIT",
  "TASK_REFUND",
  "ADMIN_ADJUSTMENT",
  "SUBSCRIPTION_GRANT",
  "SUBSCRIPTION_REVERSAL",
] as const;

export const creditTransactions = pgTable(
  "credit_transactions",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text()
      .notNull()
      .references(() => user.id),
    taskId: uuid().references(() => tasks.id),
    purchaseId: uuid().references(() => purchases.id),
    subscriptionId: uuid().references(() => subscriptions.id),
    type: text({ enum: CREDIT_TRANSACTION_TYPES }).notNull(),
    amount: integer().notNull(),
    balanceAfter: integer().notNull(),
    idempotencyKey: text().notNull().unique(),
    description: text(),
    createdAt: createdAt(),
  },
  (t) => [
    index("credit_transactions_user_id_idx").on(t.userId),
    index("credit_transactions_created_at_idx").on(t.createdAt),
    check(
      "credit_transactions_type_valid",
      sql`${t.type} in (${inList(CREDIT_TRANSACTION_TYPES)})`,
    ),
    check("credit_transactions_amount_non_zero", sql`${t.amount} <> 0`),
    check(
      "credit_transactions_balance_after_non_negative",
      sql`${t.balanceAfter} >= 0`,
    ),
  ],
);
