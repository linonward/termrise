import { expect, test } from "@playwright/test";

import { closeTestDb } from "@repo/db/testing/db";

import { signIn } from "../setup/sign-in";

// API-only; one browser project is enough. Limits: docs/architecture/security.md#rate-limiting.
test.skip(({ isMobile }) => isMobile);
test.afterAll(closeTestDb);

for (const [path, limit] of [
  ["/api/tasks", 10],
  ["/api/checkout", 10],
  ["/api/uploads", 20],
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
