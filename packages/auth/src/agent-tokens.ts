import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import type { Database } from "@repo/db/client";
import { agentTokens, user } from "@repo/db/schema";
import { AppError } from "@repo/observability/errors";

// Tokens for AI agents that work for the maintainer through /api/agent/*
// (docs/architecture/security.md#agent-tokens). A token is `trk_` plus 32 random bytes
// in base64url; only its SHA-256 is stored, so a leaked database does not leak tokens.
export const AGENT_TOKEN_PREFIX = "trk_";
const TOKEN_PATTERN = /^trk_[A-Za-z0-9_-]{43}$/;
const nameSchema = z.string().trim().min(1).max(60);

export type AgentTokenSummary = {
  id: string;
  name: string;
  preview: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
};

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const summary = (row: typeof agentTokens.$inferSelect): AgentTokenSummary => ({
  id: row.id,
  name: row.name,
  preview: row.preview,
  createdAt: row.createdAt,
  lastUsedAt: row.lastUsedAt,
  revokedAt: row.revokedAt,
});

export function createAgentTokens(deps: { database: Database }) {
  const db = deps.database;
  return {
    /** Creates a token; the returned `token` is the only time it is visible. */
    async create(userId: string, name: unknown) {
      const parsed = nameSchema.safeParse(name);
      if (!parsed.success)
        throw new AppError(
          "INVALID_INPUT",
          "Token name must be 1 to 60 characters",
        );
      const token =
        AGENT_TOKEN_PREFIX +
        base64url(crypto.getRandomValues(new Uint8Array(32)));
      const [row] = await db
        .insert(agentTokens)
        .values({
          userId,
          name: parsed.data,
          tokenHash: await sha256(token),
          preview: token.slice(0, 12),
        })
        .returning();
      return { ...summary(row), token };
    },

    async list(userId: string): Promise<AgentTokenSummary[]> {
      const rows = await db
        .select()
        .from(agentTokens)
        .where(eq(agentTokens.userId, userId))
        .orderBy(desc(agentTokens.createdAt));
      return rows.map(summary);
    },

    async revoke(userId: string, id: string): Promise<void> {
      if (!z.uuid().safeParse(id).success)
        throw new AppError("NOT_FOUND", "Token not found");
      const rows = await db
        .update(agentTokens)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(agentTokens.id, id),
            eq(agentTokens.userId, userId),
            isNull(agentTokens.revokedAt),
          ),
        )
        .returning({ id: agentTokens.id });
      if (!rows.length) throw new AppError("NOT_FOUND", "Token not found");
    },

    /** The owner of a live token, or null. Records the time of use. */
    async verify(token: string): Promise<{ id: string; email: string } | null> {
      if (!TOKEN_PATTERN.test(token)) return null;
      const [row] = await db
        .select({ id: agentTokens.id, userId: user.id, email: user.email })
        .from(agentTokens)
        .innerJoin(user, eq(user.id, agentTokens.userId))
        .where(
          and(
            eq(agentTokens.tokenHash, await sha256(token)),
            isNull(agentTokens.revokedAt),
          ),
        );
      if (!row) return null;
      await db
        .update(agentTokens)
        .set({ lastUsedAt: new Date() })
        .where(eq(agentTokens.id, row.id));
      return { id: row.userId, email: row.email };
    },
  };
}

/** Account deletion (apps/api/src/product-data.ts): the user's agents lose access. */
export async function eraseAgentTokens(
  database: Pick<Database, "delete">,
  userId: string,
) {
  await database.delete(agentTokens).where(eq(agentTokens.userId, userId));
}
