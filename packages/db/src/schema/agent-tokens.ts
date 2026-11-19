// Rules for this table: docs/architecture/data-model.md#agent-tokens
import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { createdAt } from "./columns";

// Bearer tokens for AI agents that call /api/agent/* for the maintainer. Only the SHA-256
// of a token is stored; the token itself is shown once, when it is created.
export const agentTokens = pgTable(
  "agent_tokens",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text().notNull(),
    /** Hex SHA-256 of the whole token. */
    tokenHash: text().notNull().unique(),
    /** The first 12 characters, so the owner can tell tokens apart. */
    preview: text().notNull(),
    createdAt: createdAt(),
    lastUsedAt: timestamp({ withTimezone: true }),
    revokedAt: timestamp({ withTimezone: true }),
  },
  (t) => [index("agent_tokens_user_idx").on(t.userId, t.createdAt)],
);
