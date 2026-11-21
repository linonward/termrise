import { expect, test } from "@playwright/test";

import { platformSiteMonths, platformSites } from "@repo/db/schema";
import { closeTestDb, testDb } from "@repo/db/testing/db";
import { createSites, parseSiteOpsExport } from "@repo/execution/sites";

import { signIn } from "../setup/sign-in";

test.afterAll(closeTestDb);

// Sites (docs/product/ux.md#sites): what the worker copied from site-ops, written here
// directly so the test does not depend on site-ops.
test("lists the sites with their numbers and opens one", async ({
  page,
  context,
}) => {
  const now = Date.now();
  const today = new Date(now).toISOString().slice(0, 10);
  await createSites({ database: testDb() }).sync(
    parseSiteOpsExport({
      generatedAt: now,
      since: "2026-10-15",
      sites: [
        {
          domain: "up.example",
          name: "Up Site",
          kind: "web",
          template: "web-starter",
        },
        {
          domain: "down.example",
          name: "Down Site",
          kind: "tool",
          template: "tool-starter",
        },
        // product-site.spec.ts syncs the same list, so neither removes the other's site.
        { domain: "linked.example", name: "Linked Site", kind: "tool" },
      ],
      daily: [
        {
          domain: "up.example",
          day: today,
          source: "pvuv",
          data: { pv: 40, uv: 12 },
          fetchedAt: now,
        },
        {
          domain: "up.example",
          day: today,
          source: "gsc",
          data: { clicks: 3, impressions: 2105, position: 48 },
          fetchedAt: now,
        },
      ],
      uptime: [
        {
          domain: "up.example",
          last: { at: now, status: 200, ms: 400, ok: true },
          checks24h: 288,
          up24h: 288,
          avgMs24h: 400,
        },
        {
          domain: "down.example",
          last: { at: now, status: 0, ms: 15000, ok: false },
          checks24h: 288,
          up24h: 280,
          avgMs24h: 900,
        },
      ],
      alerts: [{ key: "down.example", state: "down", since: now - 600_000 }],
      heartbeats: [{ source: "termrise", state: "up", reason: "healthy" }],
    }),
  );

  await signIn(context);
  await page.goto("/sites");
  await expect(page.getByText("3 个站，1 个掉线")).toBeVisible();
  await expect(page.getByTestId("heartbeat-termrise")).toContainText("正常");
  const upRow = page.getByTestId("site-row").filter({ hasText: "Up Site" });
  await expect(upRow).toContainText("在线");
  await expect(upRow).toContainText("12");
  await expect(upRow).toContainText("3 点击 · 2,105 展示");
  await expect(
    page.getByTestId("site-row").filter({ hasText: "Down Site" }),
  ).toContainText("掉线");

  await upRow.getByRole("link", { name: "Up Site" }).click();
  await expect(page).toHaveURL(/\/sites\/up\.example$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Up Site" }),
  ).toBeVisible();
  await expect(page.getByTestId("site-day")).toHaveCount(1);

  // Today shows the site that is down and the heartbeat.
  await page.goto("/today");
  await expect(page.getByTestId("today-down")).toContainText("Down Site");
  await expect(page.getByTestId("today-down")).not.toContainText("Up Site");
  await expect(page.getByTestId("today-heartbeat")).toContainText("正常");
});

test("an unknown site is a 404, and sites need a session", async ({
  page,
  context,
}) => {
  await page.goto("/sites");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fsites$/);
  await signIn(context);
  const response = await page.goto("/sites/nope.example");
  expect(response?.status()).toBe(404);
});

// A wide table scrolls inside its own box and never widens the page (S92). A platform
// site's row has a hide button with screen-reader text: absolutely placed, it widened
// the page until the table's scroll box became positioned. Six months of visits give
// six month columns, wider than a phone.
test("wide lists do not widen the page", async ({ page, context }) => {
  await signIn(context);
  const [wide] = await testDb()
    .insert(platformSites)
    .values({
      host: `wide-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.vercel.app`,
      platform: "vercel.app",
      firstCrawl: "CC-MAIN-2026-43",
      etv: 1234,
      checkedAt: new Date(),
      pageTitle: "A page title long enough to make the table wider",
    })
    .returning();
  const now = new Date();
  await testDb()
    .insert(platformSiteMonths)
    .values(
      Array.from({ length: 6 }, (_, i) => ({
        siteId: wide.id,
        month: new Date(
          Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1),
        )
          .toISOString()
          .slice(0, 7),
        etv: 1234 + i,
      })),
    );
  for (const path of [
    "/sites",
    "/discover/platforms",
    "/keywords",
    "/discover",
  ]) {
    await page.goto(path);
    // Against the configured viewport: on an emulated phone the layout viewport, and
    // so innerWidth, grows with an overflowing page.
    const scroll = await page.evaluate(
      () => document.documentElement.scrollWidth,
    );
    expect(scroll, path).toBeLessThanOrEqual(page.viewportSize()!.width);
  }
});
