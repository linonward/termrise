import { afterAll, beforeEach, expect, it } from "vitest";

import { closeTestDb, resetDb } from "@repo/db/testing/db";

import { createTestClient } from "../testing/client";
import { expectRateLimited } from "../testing/rate-limit";
import { TEST_APP_URL } from "../testing/worker";

const { call, signIn } = createTestClient({
  STORAGE_PROVIDER: "fake",
  ALLOW_FAKE_PROVIDERS: "1",
});

let cookie: string;
beforeEach(async () => {
  await resetDb();
  cookie = await signIn("uploads@example.com");
});
afterAll(closeTestDb);

const valid = { contentType: "image/jpeg", size: 2048, extension: "jpg" };
const upload = (body: unknown, headers: Record<string, string> = { cookie }) =>
  call("/api/uploads", {
    method: "POST",
    headers: {
      Origin: TEST_APP_URL,
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });

it("signs an upload under the user's prefix for five minutes", async () => {
  const response = await upload(valid);
  expect(response.status).toBe(200);
  expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
    TEST_APP_URL,
  );
  const body = await response.json();
  expect(body.objectKey).toMatch(/^uploads\/[^/]+\/[0-9a-f-]{36}\.jpg$/);
  expect(body.headers).toEqual({ "Content-Type": "image/jpeg" });
  const ttl = Date.parse(body.expiresAt) - Date.now();
  expect(ttl).toBeGreaterThan(290_000);
  expect(ttl).toBeLessThanOrEqual(300_000);
});

it("rejects an upload that breaks the rules", async () => {
  const response = await upload({ ...valid, size: 10 * 1024 * 1024 + 1 });
  expect(response.status).toBe(400);
  expect((await response.json()).error.code).toBe("INVALID_INPUT");
});

it("needs a session", async () => {
  const response = await upload(valid, {});
  expect(response.status).toBe(401);
});

it("allows twenty uploads a minute, then answers 429", async () => {
  const limited = await expectRateLimited(() => upload(valid), 20);
  expect((await limited.json()).error.code).toBe("RATE_LIMITED");
});
