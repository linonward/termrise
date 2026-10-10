import { randomUUID } from "node:crypto";
import { gunzipSync } from "node:zlib";

import { expect, test, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";

import { createCreditService } from "@repo/credits/credit-service";
import { analyticsConsents } from "@repo/db/schema";
import { closeTestDb, testDb } from "@repo/db/testing/db";

import product from "../../../../product.config";
import { E2E_API_URL } from "../setup/e2e-env";
import { signIn } from "../setup/sign-in";

// E2E builds set NEXT_PUBLIC_POSTHOG_KEY; /ingest is intercepted so nothing leaves the browser.
test.afterAll(closeTestDb);
// Start with no consent decision (the shared config declines analytics).
test.use({ storageState: { cookies: [], origins: [] } });

type Captured = { event: string; properties: Record<string, unknown> };

async function interceptAnalytics(page: Page) {
  // PostHog drops events from automated browsers; look like a regular one.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });
    Object.defineProperty(navigator, "userAgentData", { get: () => undefined });
  });
  const events: Captured[] = [];
  const payloads: string[] = [];
  await page.route("**/ingest/**", async (route) => {
    const request = route.request();
    if (
      request.method() === "POST" &&
      /\/ingest\/(e|i\/v0\/e)\//.test(request.url())
    ) {
      const buffer = request.postDataBuffer() ?? Buffer.from("");
      let text: string;
      try {
        text = gunzipSync(buffer).toString();
      } catch {
        text = buffer.toString();
      }
      payloads.push(text);
      const body = JSON.parse(text);
      events.push(...(Array.isArray(body) ? body : (body.batch ?? [body])));
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "{}",
    });
  });
  const names = () => events.map((e) => e.event);
  return { events, payloads, names };
}

const banner = (page: Page) =>
  page.getByRole("region", { name: "Cookie preferences" });

test("sends nothing and sets no cookie until the visitor accepts", async ({
  page,
  context,
}) => {
  const analytics = await interceptAnalytics(page);
  await page.goto("/");
  await expect(banner(page)).toBeVisible();
  await page.getByRole("button", { name: "Decline" }).click();
  await expect(banner(page)).toBeHidden();
  await page.goto("/pricing");
  await expect(banner(page)).toBeHidden();
  await page.waitForTimeout(1500);
  expect(analytics.events).toEqual([]);
  const cookies = await context.cookies();
  expect(cookies.filter((c) => c.name.startsWith("ph_"))).toEqual([]);
});

test("after consent, page events carry the locale and product id and settings reopen the banner", async ({
  page,
  context,
}) => {
  const analytics = await interceptAnalytics(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Accept" }).click();
  await page.reload();
  await expect.poll(analytics.names).toContain("landing_viewed");
  expect(
    analytics.events.find((e) => e.event === "landing_viewed")?.properties,
  ).toMatchObject({ locale: "en", product_id: product.id });
  const cookies = await context.cookies();
  expect(cookies.some((c) => c.name.startsWith("ph_"))).toBe(true);

  await page.goto("/");
  await expect(banner(page)).toBeHidden();
  await page
    .getByRole("contentinfo")
    .getByRole("button", { name: "Cookie settings" })
    .click();
  await expect(banner(page)).toBeVisible();
});

test("identifies signed-in users by id and never sends their email", async ({
  page,
  context,
}) => {
  const { userId, email } = await signIn(context);
  const analytics = await interceptAnalytics(page);
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Accept" }).click();
  await page.goto("/dashboard");
  await expect.poll(analytics.names).toContain("dashboard_viewed");
  const viewed = analytics.events.find((e) => e.event === "dashboard_viewed");
  expect(viewed?.properties.distinct_id).toBe(userId);
  expect(analytics.payloads.join("\n")).not.toContain(email);
  // Stored for server-side events.
  await expect
    .poll(async () => {
      const [row] = await testDb()
        .select()
        .from(analyticsConsents)
        .where(eq(analyticsConsents.userId, userId));
      return row?.granted;
    })
    .toBe(true);
});

test("identifies events right after a signed-in user accepts on the same page", async ({
  page,
  context,
}) => {
  // Needs the example paid action, hidden while the product does not charge; the client
  // identify logic keeps its unit test (packages/analytics/src/client.test.ts).
  test.skip(
    !product.billingEnabled,
    "billing is disabled in product.config.ts",
  );
  const { userId } = await signIn(context);
  const analytics = await interceptAnalytics(page);
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Accept" }).click();
  // No reload: the user identified on mount, before the SDK loaded.
  await page.getByLabel("Text").fill("hello");
  await page.getByRole("button", { name: "Run · 1 credit" }).click();
  await expect.poll(analytics.names).toContain("task_started");
  const started = analytics.events.find((e) => e.event === "task_started");
  expect(started?.properties.distinct_id).toBe(userId);
});

test("consent API needs a signed-in user and a boolean", async ({
  request,
  context,
}) => {
  const anonymous = await request.post(`${E2E_API_URL}/api/analytics/consent`, {
    data: { granted: true },
  });
  expect(anonymous.status()).toBe(401);
  await signIn(context);
  const invalid = await context.request.post(
    `${E2E_API_URL}/api/analytics/consent`,
    {
      data: { granted: "yes" },
    },
  );
  expect(invalid.status()).toBe(400);
  const ok = await context.request.post(
    `${E2E_API_URL}/api/analytics/consent`,
    {
      data: { granted: false },
    },
  );
  expect(ok.status()).toBe(204);
});

test("reports task_started and credits_exhausted when the balance is too low", async ({
  page,
  context,
}) => {
  // Needs the example paid action, hidden while the product does not charge; the client
  // identify logic keeps its unit test (packages/analytics/src/client.test.ts).
  test.skip(
    !product.billingEnabled,
    "billing is disabled in product.config.ts",
  );
  const { userId } = await signIn(context);
  await createCreditService(testDb()).adminAdjust(
    userId,
    -10,
    randomUUID(),
    "e2e: empty balance",
  );
  const analytics = await interceptAnalytics(page);
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Accept" }).click();
  await page.getByLabel("Text").fill("hello");
  await page.getByRole("button", { name: "Run · 1 credit" }).click();
  await expect.poll(analytics.names).toContain("credits_exhausted");
  const started = analytics.events.find((e) => e.event === "task_started");
  expect(started?.properties).toMatchObject({ inputLength: 5 });
  // The input text itself is never sent.
  expect(analytics.payloads.join("\n")).not.toContain('"hello"');
});
