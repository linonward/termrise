// Newly registered domains (docs/product/keyword-pool.md#new-domains, S98): a maker
// buying a domain for a phrase is an early sign of a need, often before a page exists.
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import { createdAt, inList } from "./columns";

/** pending: not probed yet. live: a page answers. parked: a for-sale or parking page.
 * unresolved: no answer (bought, not built yet: still a sign). */
export const NEW_DOMAIN_STATUSES = [
  "pending",
  "live",
  "parked",
  "unresolved",
] as const;

export const newDomains = pgTable(
  "new_domains",
  {
    domain: text().primaryKey(),
    /** The day of the registry list it came in. */
    listedOn: date().notNull(),
    /** The domain without its TLD. */
    label: text().notNull(),
    status: text({ enum: NEW_DOMAIN_STATUSES }).notNull().default("pending"),
    title: text(),
    /** The page links to pricing or shows prices: someone means to charge. */
    hasPricing: boolean(),
    /** The phrase read from the domain (hyphens, or a tool word at the end). */
    phrase: text(),
    probedAt: timestamp({ withTimezone: true }),
    /** When its phrase went to the new words. */
    sentAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index("new_domains_listed_idx").on(t.listedOn),
    check(
      "new_domains_status_valid",
      sql`${t.status} in (${inList(NEW_DOMAIN_STATUSES)})`,
    ),
  ],
);
