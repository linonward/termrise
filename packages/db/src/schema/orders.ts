// Rules for these tables: docs/architecture/data-model.md
import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { createdAt, inList } from "./columns";

export const PURCHASE_STATUSES = [
  "PENDING",
  "PAID",
  "FAILED",
  "REFUNDED",
] as const;

export const purchases = pgTable(
  "purchases",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text()
      .notNull()
      .references(() => user.id),
    provider: text().notNull(),
    // Set once createCheckout() returns; Waffo has no order id until the webhook.
    providerSessionId: text(),
    // Nullable so a PENDING purchase can exist before the provider returns an order id.
    providerOrderId: text(),
    providerPaymentId: text(),
    packId: text().notNull(),
    amountUsd: integer().notNull(), // cents
    credits: integer().notNull(),
    status: text({ enum: PURCHASE_STATUSES }).notNull(),
    createdAt: createdAt(),
    completedAt: timestamp({ withTimezone: true }),
    refundedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    index("purchases_user_id_idx").on(t.userId),
    unique("purchases_provider_order_unique").on(t.provider, t.providerOrderId),
    check(
      "purchases_status_valid",
      sql`${t.status} in (${inList(PURCHASE_STATUSES)})`,
    ),
  ],
);

// docs/adr/009-subscription.md. PENDING until Waffo reports a payment or activation;
// FAILED when the checkout fails or a newer unpaid checkout replaces it.
export const SUBSCRIPTION_STATUSES = [
  "PENDING",
  "ACTIVE",
  "CANCELING",
  "PAST_DUE",
  "CANCELED",
  "FAILED",
] as const;

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text()
      .notNull()
      .references(() => user.id),
    provider: text().notNull(),
    providerSessionId: text(),
    // Set by the first payment or activation webhook; a set value means paid.
    providerOrderId: text(),
    planId: text().notNull(),
    amountUsd: integer().notNull(), // cents per period
    credits: integer().notNull(), // per period, snapshot at checkout
    status: text({ enum: SUBSCRIPTION_STATUSES }).notNull(),
    // Waffo time of the status event last applied; older events arrive late and are skipped.
    statusUpdatedAt: timestamp({ withTimezone: true }),
    currentPeriodEnd: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index("subscriptions_user_id_idx").on(t.userId),
    unique("subscriptions_provider_order_unique").on(
      t.provider,
      t.providerOrderId,
    ),
    check(
      "subscriptions_status_valid",
      sql`${t.status} in (${inList(SUBSCRIPTION_STATUSES)})`,
    ),
  ],
);

export const paymentEvents = pgTable(
  "payment_events",
  {
    id: uuid().primaryKey().defaultRandom(),
    provider: text().notNull(),
    providerEventId: text().notNull(),
    eventType: text().notNull(),
    payload: jsonb(),
    processedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    unique("payment_events_provider_event_unique").on(
      t.provider,
      t.providerEventId,
    ),
  ],
);
