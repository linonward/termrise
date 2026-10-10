import { afterAll, beforeEach, expect, it } from "vitest";

import { analyticsConsents } from "@repo/db/schema";
import { closeTestDb, resetDb, testDb } from "@repo/db/testing/db";

import { createTestClient } from "../testing/client";
import { TEST_APP_URL } from "../testing/worker";

const { call, signIn } = createTestClient();

let cookie: string;
beforeEach(async () => {
  await resetDb();
  cookie = await signIn("consent@example.com");
});
afterAll(closeTestDb);

const consent = (body: unknown, headers: Record<string, string> = { cookie }) =>
  call("/api/analytics/consent", {
    method: "POST",
    headers: {
      Origin: TEST_APP_URL,
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });

it("stores the banner choice of the signed-in user without a PostHog key", async () => {
  expect((await consent({ granted: true })).status).toBe(204);
  expect((await consent({ granted: false })).status).toBe(204);
  const rows = await testDb().select().from(analyticsConsents);
  expect(rows.map((r) => r.granted)).toEqual([false]);
});

it("needs a session and a boolean", async () => {
  expect((await consent({ granted: true }, {})).status).toBe(401);
  const invalid = await consent({ granted: "yes" });
  expect(invalid.status).toBe(400);
  expect((await invalid.json()).error.code).toBe("INVALID_INPUT");
});
