import { expect, test } from "@playwright/test";

import { closeTestDb } from "@repo/db/testing/db";

import { E2E_API_URL } from "../setup/e2e-env";
import { signIn } from "../setup/sign-in";

// API-only; one browser project is enough. Limits: docs/architecture/security.md#rate-limiting.
test.skip(({ isMobile }) => isMobile);
test.afterAll(closeTestDb);

// Served by apps/api; the cookie for localhost goes to every port.
for (const [path, limit] of [
  [`${E2E_API_URL}/api/tasks`, 10],
  [`${E2E_API_URL}/api/checkout`, 10],
  [`${E2E_API_URL}/api/uploads`, 20],
] as const)
  test(`${path} allows ${limit} requests a minute, then answers 429`, async ({
    context,
  }) => {
    await signIn(context);
    // Invalid bodies still count: the limit is checked before validation.
    for (let i = 0; i < limit; i++) {
      const ok = await context.request.post(path, { data: {} });
      expect(ok.status(), `request ${i + 1}`).not.toBe(429);
    }
    const limited = await context.request.post(path, { data: {} });
    expect(limited.status()).toBe(429);
    expect((await limited.json()).error.code).toBe("RATE_LIMITED");
    expect(Number(limited.headers()["retry-after"])).toBeGreaterThan(0);
  });
