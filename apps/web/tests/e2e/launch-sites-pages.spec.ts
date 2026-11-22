import { expect, test } from "@playwright/test";

import { launchSites } from "@repo/db/schema";
import { closeTestDb, testDb } from "@repo/db/testing/db";

import { signIn } from "../setup/sign-in";

test.afterAll(closeTestDb);

// New sites come 50 a page; before S94 only the newest 50 could be reached.
test("pages through launch sites", async ({ page, context }) => {
  await signIn(context);
  const token = `pg${Date.now()}${Math.floor(Math.random() * 1000)}`;
  await testDb()
    .insert(launchSites)
    .values(
      Array.from({ length: 55 }, (_, i) => ({
        source: "hacker_news" as const,
        sourceId: `${token}-${i}`,
        sourceUrl: `https://news.ycombinator.com/item?id=${token}${i}`,
        url: `https://${token}-${i}.example`,
        site: `${token}-${i}.example`,
        postTitle: `Show HN: ${token} ${i}`,
        postedAt: new Date(Date.now() - i * 60_000),
      })),
    );
  await page.goto(`/discover/sites?q=${token}`);
  const pager = page.getByRole("navigation", { name: "新站分页" });
  await expect(pager).toContainText("第 1 页，共 2 页");
  await pager.getByRole("link", { name: "下一页" }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(pager).toContainText("第 2 页，共 2 页");
  await expect(page.getByText(`${token}-54.example`)).toBeVisible();
});
