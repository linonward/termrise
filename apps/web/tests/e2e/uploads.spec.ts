import { expect, test } from "@playwright/test";

import { closeTestDb } from "@repo/db/testing/db";

import { E2E_API_URL } from "../setup/e2e-env";
import { signIn } from "../setup/sign-in";

test.afterAll(closeTestDb);
// API-only; one browser project is enough.
test.skip(({ isMobile }) => isMobile);

// apps/api; the cookie for localhost goes to every port.
const UPLOADS = `${E2E_API_URL}/api/uploads`;
const valid = { contentType: "image/jpeg", size: 2048, extension: "jpg" };

test("requires a session", async ({ request }) => {
  const response = await request.post(UPLOADS, { data: valid });
  expect(response.status()).toBe(401);
  expect(await response.json()).toEqual({
    error: { code: "UNAUTHORIZED", message: expect.any(String) },
  });
});

test("signs an upload under the user's prefix and validates input", async ({
  context,
}) => {
  const { userId } = await signIn(context);
  const ok = await context.request.post(UPLOADS, { data: valid });
  expect(ok.status()).toBe(200);
  const body = await ok.json();
  expect(body.objectKey).toMatch(
    new RegExp(`^uploads/${userId}/[0-9a-f-]{36}\\.jpg$`),
  );
  expect(body.headers).toEqual({ "Content-Type": "image/jpeg" });
  // Signed for 5 minutes (STORAGE_PROVIDER=fake in E2E; R2 signing is unit-tested).
  expect(Date.parse(body.expiresAt) - Date.now()).toBeGreaterThan(290_000);
  expect(Date.parse(body.expiresAt) - Date.now()).toBeLessThanOrEqual(300_000);

  const bad = await context.request.post(UPLOADS, {
    data: { ...valid, size: 10 * 1024 * 1024 + 1 },
  });
  expect(bad.status()).toBe(400);
  expect((await bad.json()).error.code).toBe("INVALID_INPUT");
  const notJson = await context.request.post(UPLOADS, {
    headers: { "Content-Type": "application/json" },
    data: "{",
  });
  expect(notJson.status()).toBe(400);
});

test("limits uploads to 20 requests per minute", async ({ context }) => {
  await signIn(context);
  // Window counting is covered by the integration test. Here: the route enforces it.
  // 41 requests span at most two windows (40 allowed), so one must be limited.
  for (let i = 0; i < 41; i++) {
    const response = await context.request.post(UPLOADS, {
      data: valid,
    });
    if (response.status() === 429) {
      expect(i).toBeGreaterThanOrEqual(20);
      expect((await response.json()).error.code).toBe("RATE_LIMITED");
      expect(Number(response.headers()["retry-after"])).toBeGreaterThan(0);
      return;
    }
    expect(response.status()).toBe(200);
  }
  throw new Error("no request was rate limited");
});
