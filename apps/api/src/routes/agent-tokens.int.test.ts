import { afterAll, beforeEach, expect, it } from "vitest";

import { closeTestDb, resetDb } from "@repo/db/testing/db";

import { createTestClient } from "../testing/client";
import { TEST_APP_URL } from "../testing/worker";

// Agent tokens (docs/architecture/security.md#agent-tokens): made in settings with the
// session cookie, then used alone, without cookie or Origin, on the same routes.
const { call, signIn } = createTestClient();

let cookie: string;
let other: string;
beforeEach(async () => {
  await resetDb();
  cookie = await signIn("owner@example.com");
  other = await signIn("other@example.com");
});
afterAll(closeTestDb);

const asUser = (
  method: string,
  path: string,
  body?: unknown,
  session = cookie,
) =>
  call(path, {
    method,
    headers: {
      cookie: session,
      Origin: TEST_APP_URL,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const asAgent = (token: string, method: string, path: string, body?: unknown) =>
  call(path, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

async function newToken(name = "Claude Code") {
  const response = await asUser("POST", "/api/settings/agent-tokens", { name });
  expect(response.status).toBe(201);
  return (await response.json()) as {
    id: string;
    token: string;
    preview: string;
  };
}

it("creates a token, shows it once, and lists it without the secret", async () => {
  const created = await newToken();
  expect(created.token).toMatch(/^trk_/);
  const list = await (await asUser("GET", "/api/settings/agent-tokens")).json();
  expect(list.items).toEqual([
    expect.objectContaining({
      id: created.id,
      name: "Claude Code",
      preview: created.preview,
      revokedAt: null,
    }),
  ]);
  expect(JSON.stringify(list)).not.toContain(created.token);
});

it("lets an agent read and write the signed-in routes with the token alone", async () => {
  const { token } = await newToken();
  expect((await asAgent(token, "GET", "/api/today")).status).toBe(200);
  const added = await asAgent(token, "POST", "/api/pool/keywords", {
    phrases: ["hotel lobby ai"],
    source: "agent",
  });
  expect(added.status).toBeLessThan(300);
  const list = await (
    await asAgent(token, "GET", "/api/pool/keywords?q=hotel")
  ).json();
  expect(JSON.stringify(list)).toContain("hotel lobby ai");
});

it("refuses a wrong, malformed or revoked token with 401", async () => {
  const { token, id } = await newToken();
  expect(
    (await asAgent(`trk_${"x".repeat(43)}`, "GET", "/api/today")).status,
  ).toBe(401);
  expect((await asAgent("trk_short", "GET", "/api/today")).status).toBe(401);
  expect(
    (await asUser("DELETE", `/api/settings/agent-tokens/${id}`)).status,
  ).toBe(204);
  expect((await asAgent(token, "GET", "/api/today")).status).toBe(401);
});

it("keeps each user's tokens to themselves", async () => {
  const { id, token } = await newToken();
  expect(
    (
      await asUser(
        "DELETE",
        `/api/settings/agent-tokens/${id}`,
        undefined,
        other,
      )
    ).status,
  ).toBe(404);
  const theirs = await (
    await asUser("GET", "/api/settings/agent-tokens", undefined, other)
  ).json();
  expect(theirs.items).toEqual([]);
  expect((await asAgent(token, "GET", "/api/today")).status).toBe(200);
});
