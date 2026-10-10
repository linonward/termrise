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
    // Invalid bodies still count: the limit is checked before validation. Limits count
    // per fixed minute, so 2 × limit + 1 requests span at most two windows.
    let limited;
    for (let i = 0; i < 2 * limit + 1 && !limited; i++) {
      const response = await context.request.post(path, { data: {} });
      if (response.status() === 429) {
        expect(i, "requests allowed before 429").toBeGreaterThanOrEqual(limit);
        limited = response;
      }
    }
    if (!limited) throw new Error("no request was rate limited");
    expect((await limited.json()).error.code).toBe("RATE_LIMITED");
    expect(Number(limited.headers()["retry-after"])).toBeGreaterThan(0);
  });
