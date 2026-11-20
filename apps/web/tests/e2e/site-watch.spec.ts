import { expect, test } from "@playwright/test";

import { watchPages, watchSources } from "@repo/db/schema";
import { closeTestDb, testDb } from "@repo/db/testing/db";

import { signIn } from "../setup/sign-in";

test.afterAll(closeTestDb);

// Watched sites (docs/product/keyword-pool.md#site-watch): a section and a new page are
// written here as a scan writes them, so the test needs no network.
test("lists watched sections and their new pages, and adds and removes one", async ({
  page,
  context,
}) => {
  const host = `w${Date.now()}${Math.floor(Math.random() * 1000)}.example`;
  const [source] = await testDb()
    .insert(watchSources)
    .values({
      prefix: `https://${host}/tools/`,
      method: "sitemap",
      readFrom: [`https://${host}/sitemap.xml`],
      baselineAt: new Date(),
      lastCheckedAt: new Date(),
      pagesKnown: 12,
    })
    .returning();
  await testDb()
    .insert(watchPages)
    .values({
      sourceId: source.id,
      url: `https://${host}/tools/goodbye-gta-5-ai-video-generator`,
      title: "Goodbye GTA 5 AI Video Generator",
      phrase: `goodbye gta 5 ai video ${host}`,
    });

  await signIn(context);
  await page.goto("/discover/watch");
  const row = page.getByTestId("watch-source").filter({ hasText: host });
  await expect(row).toContainText("sitemap");
  await expect(row).toContainText("已知 12 页");
  await expect(
    page.getByTestId("watch-page").filter({ hasText: host }),
  ).toContainText("Goodbye GTA 5 AI Video Generator");

  const added = `n${host}`;
  await page.getByLabel("栏目地址").fill(`${added}/blog/ai`);
  await page.getByRole("button", { name: "开始盯" }).click();
  const newRow = page.getByTestId("watch-source").filter({ hasText: added });
  await expect(newRow).toContainText("待检查");
  await newRow.getByRole("button", { name: "不盯了" }).click();
  await expect(newRow).toHaveCount(0);
});
