// Rules for these tables: docs/architecture/data-model.md#radar
import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { inList } from "./columns";

export const RADAR_PROVIDERS = ["hacker_news"] as const;
export const RADAR_LISTS = ["top", "show"] as const;

// A story the radar saw on a public source (docs/product/product.md#f01-热词发现). Global:
// every signed-in user sees the same items. One row per story; each collection appends
// an observation.
export const radarItems = pgTable(
  "radar_items",
  {
    id: uuid().primaryKey().defaultRandom(),
    provider: text({ enum: RADAR_PROVIDERS }).notNull(),
    externalId: text().notNull(),
    // The story's link; null for a text post (Ask HN).
    url: text(),
    title: text().notNull(),
    normalizedTerm: text().notNull(),
    // When the source published it; null when the source does not say.
    postedAt: timestamp({ withTimezone: true }),
    // First and last time this system saw it, not when it first appeared online.
    firstSeenAt: timestamp({ withTimezone: true }).notNull(),
    lastSeenAt: timestamp({ withTimezone: true }).notNull(),
    // Latest discussion counts; null when the source does not report them.
    score: integer(),
    comments: integer(),
  },
  (t) => [
    unique("radar_items_provider_external_unique").on(t.provider, t.externalId),
    index("radar_items_last_seen_idx").on(t.lastSeenAt),
    index("radar_items_term_idx").on(t.normalizedTerm),
    check(
      "radar_items_provider_valid",
      sql`${t.provider} in (${inList(RADAR_PROVIDERS)})`,
    ),
  ],
);

// One sighting of an item on a source list: its rank and counts at that time. Append-only.
export const radarObservations = pgTable(
  "radar_observations",
  {
    id: uuid().primaryKey().defaultRandom(),
    itemId: uuid()
      .notNull()
      .references(() => radarItems.id, { onDelete: "cascade" }),
    observedAt: timestamp({ withTimezone: true }).notNull(),
    list: text({ enum: RADAR_LISTS }).notNull(),
    // 1-based position on the list.
    rank: integer().notNull(),
    score: integer(),
    comments: integer(),
  },
  (t) => [
    index("radar_observations_item_time_idx").on(t.itemId, t.observedAt),
    check(
      "radar_observations_list_valid",
      sql`${t.list} in (${inList(RADAR_LISTS)})`,
    ),
    check("radar_observations_rank_positive", sql`${t.rank} >= 1`),
  ],
);

// A user's starred radar items. Radar items are global; the star is the user's.
export const radarFavorites = pgTable(
  "radar_favorites",
  {
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    itemId: uuid()
      .notNull()
      .references(() => radarItems.id, { onDelete: "cascade" }),
    createdAt: timestamp({ withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.itemId] })],
);
