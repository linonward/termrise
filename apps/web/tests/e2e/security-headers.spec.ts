import { expect, test, type Page } from "@playwright/test";

import { closeTestDb } from "@repo/db/testing/db";

import { signIn } from "../setup/sign-in";

test.afterAll(closeTestDb);

const ENFORCED_CSP =
  "frame-ancestors 'none'; object-src 'none'; base-uri 'none'; form-action 'self'";

for (const path of ["/", "/sign-in", "/api/tasks"])
  test(`${path} sends security headers`, async ({ request }) => {
    const headers = (await request.get(path)).headers();
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["content-security-policy"]).toBe(ENFORCED_CSP);
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["x-powered-by"]).toBeUndefined();
  });

test("pages send a report-only script policy with a fresh nonce", async ({
  request,
}) => {
  const policy = async () =>
    (await request.get("/")).headers()["content-security-policy-report-only"];
  const first = await policy();
  expect(first).toMatch(/script-src 'nonce-[\w+/=-]+' 'strict-dynamic'/);
  expect(await policy()).not.toBe(first);
  expect(
    (await request.get("/api/tasks")).headers()[
      "content-security-policy-report-only"
    ],
  ).toBeUndefined();
});

// Violations of the report-only policy do not block anything, so collect them.
async function violations(page: Page, path: string) {
  await page.addInitScript(() => {
    const seen: string[] = [];
    Object.assign(window, { cspViolations: seen });
    document.addEventListener("securitypolicyviolation", (e) =>
      seen.push(`${e.violatedDirective} ${e.blockedURI}`),
    );
  });
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  return page.evaluate(
    () => (window as unknown as { cspViolations: string[] }).cspViolations,
  );
}

for (const path of ["/", "/sign-in", "/pricing", "/blog"])
  test(`${path} loads without CSP violations`, async ({ page }) => {
    expect(await violations(page, path)).toEqual([]);
  });

test("signed-in pages load without CSP violations", async ({
  page,
  context,
}) => {
  await signIn(context);
  expect(await violations(page, "/dashboard")).toEqual([]);
  expect(await violations(page, "/billing")).toEqual([]);
});
