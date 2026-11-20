import { expect, test } from "@playwright/test";

import { closeTestDb, testDb } from "@repo/db/testing/db";
import { createExecutionService } from "@repo/execution/execution-service";
import { createSites, parseSiteOpsExport } from "@repo/execution/sites";
import { createKeywordPool } from "@repo/research/pool-service";

import { signIn } from "../setup/sign-in";

test.afterAll(closeTestDb);

// A product whose domain is a live site (docs/product/ux.md#products): the product shows
// the site's numbers instead of the forms, and the site links back to it.
test("a product and its site link to each other", async ({ page, context }) => {
  const { userId } = await signIn(context);
  // The same site list as sites.spec.ts: a sync removes the sites it does not list.
  const domain = "linked.example";
  const now = Date.now();
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
        { domain, name: "Linked Site", kind: "tool" },
      ],
      daily: [
        {
          domain,
          day: new Date(now).toISOString().slice(0, 10),
          source: "pvuv",
          data: { pv: 70, uv: 23 },
          fetchedAt: now,
        },
      ],
      uptime: [],
      alerts: [{ key: "down.example", state: "down", since: now - 600_000 }],
      heartbeats: [],
    }),
  );
  const keyword = await createKeywordPool({ database: testDb() }).record({
    phrase: `linked product ${Date.now()} ${Math.random()}`,
    status: "selected",
    reasons: [],
    kind: "review",
  });
  const execution = createExecutionService({ database: testDb() });
  const project = await execution.startFromKeyword(userId, {
    poolKeywordId: keyword.id,
    name: "Linked Product",
  });
  await execution.update(userId, project.id, { domain });

  await page.goto(`/products/${project.id}`);
  const panel = page.getByTestId("product-site");
  await expect(panel).toContainText(domain);
  await expect(panel.getByTestId("site-stats")).toContainText("23");
  await expect(page.getByText("记录收入")).toHaveCount(0);

  await panel.getByRole("link", { name: domain }).click();
  await expect(page).toHaveURL(
    new RegExp(`/sites/${domain.replace(".", "\\.")}$`),
  );
  const back = page.getByTestId("site-product");
  await expect(back).toContainText("Linked Product");
  await back.getByRole("link", { name: "Linked Product" }).click();
  await expect(page).toHaveURL(new RegExp(`/products/${project.id}$`));
});
