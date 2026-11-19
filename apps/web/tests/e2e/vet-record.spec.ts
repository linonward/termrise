import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

import { closeTestDb, testDb } from "@repo/db/testing/db";
import { createKeywordPool } from "@repo/research/pool-service";

import { signIn } from "../setup/sign-in";

test.afterAll(closeTestDb);

// A vetting record (docs/product/keyword-pool.md#vet), written here the way the API
// writes it for an agent: Today lists it to look at again, the keyword page shows it.
test("a vet record shows on Today and on the keyword page", async ({
  page,
  context,
}) => {
  const { userId } = await signIn(context);
  const phrase = `vet e2e ${randomUUID().slice(0, 8)}`;
  const soon = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
  await createKeywordPool({ database: testDb() }).vet(userId, {
    phrase,
    verdict: "watch",
    score: { total: 54, max: 90 },
    summary: "观察：美国约 300/月，峰值已过。",
    markdown: "# 选词简报\n\n结论：观察",
    recheck: [soon],
  });

  await page.goto("/today");
  const row = page.getByTestId("today-reviews").getByRole("listitem").filter({
    hasText: phrase,
  });
  await expect(row).toContainText(`${soon} 复查`);
  await row.getByRole("link", { name: phrase }).click();

  const record = page.getByTestId("vet-record");
  await expect(record).toContainText("观察");
  await expect(record).toContainText("54/90 分");
  await expect(record).toContainText("峰值已过");
  await record.getByText("完整记录").click();
  await expect(record.getByText("结论：观察")).toBeVisible();
});
