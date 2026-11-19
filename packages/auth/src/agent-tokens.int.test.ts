import { afterAll, beforeEach, expect, it } from "vitest";

import { agentTokens, user } from "@repo/db/schema";
import { closeTestDb, resetDb, testDb } from "@repo/db/testing/db";

import { AGENT_TOKEN_PREFIX, createAgentTokens } from "./agent-tokens";

const db = testDb();
const tokens = createAgentTokens({ database: db });

beforeEach(async () => {
  await resetDb();
  await db.insert(user).values([
    { id: "a", name: "A", email: "a@example.com" },
    { id: "b", name: "B", email: "b@example.com" },
  ]);
});
afterAll(closeTestDb);

it("shows a new token once and stores only its hash", async () => {
  const created = await tokens.create("a", "Claude Code");
  expect(created.token).toMatch(
    new RegExp(`^${AGENT_TOKEN_PREFIX}[A-Za-z0-9_-]{43}$`),
  );
  expect(created.preview).toBe(created.token.slice(0, 12));
  const [row] = await db.select().from(agentTokens);
  expect(row.tokenHash).not.toContain(created.token);
  expect(row.tokenHash).toMatch(/^[0-9a-f]{64}$/);
  expect(await tokens.list("a")).toEqual([
    expect.objectContaining({
      id: created.id,
      name: "Claude Code",
      preview: created.preview,
      lastUsedAt: null,
      revokedAt: null,
    }),
  ]);
  expect(await tokens.list("b")).toEqual([]);
});

it("verifies a live token to its owner and records when it was used", async () => {
  const { token, id } = await tokens.create("a", "agent");
  expect(await tokens.verify(token)).toEqual({
    id: "a",
    email: "a@example.com",
  });
  const [listed] = await tokens.list("a");
  expect(listed.id).toBe(id);
  expect(listed.lastUsedAt).toBeInstanceOf(Date);
});

it("refuses unknown, malformed and revoked tokens", async () => {
  const { token, id } = await tokens.create("a", "agent");
  expect(
    await tokens.verify(`${AGENT_TOKEN_PREFIX}${"x".repeat(43)}`),
  ).toBeNull();
  expect(await tokens.verify("not-a-token")).toBeNull();
  expect(await tokens.verify("")).toBeNull();
  await tokens.revoke("a", id);
  expect(await tokens.verify(token)).toBeNull();
  expect((await tokens.list("a"))[0].revokedAt).toBeInstanceOf(Date);
});

it("lets only the owner revoke a token", async () => {
  const { id, token } = await tokens.create("a", "agent");
  await expect(tokens.revoke("b", id)).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
  expect(await tokens.verify(token)).not.toBeNull();
});

it("needs a name of 1 to 60 characters", async () => {
  await expect(tokens.create("a", "  ")).rejects.toMatchObject({
    code: "INVALID_INPUT",
  });
  await expect(tokens.create("a", "x".repeat(61))).rejects.toMatchObject({
    code: "INVALID_INPUT",
  });
});

it("deletes a user's tokens when the account is erased", async () => {
  const { token } = await tokens.create("a", "agent");
  await tokens.create("b", "agent");
  const { eraseAgentTokens } = await import("./agent-tokens");
  await eraseAgentTokens(db, "a");
  expect(await tokens.verify(token)).toBeNull();
  expect(await tokens.list("a")).toEqual([]);
  expect(await tokens.list("b")).toHaveLength(1);
});
