import { expect, test } from "@playwright/test";

import { closeTestDb } from "@repo/db/testing/db";

import { signIn } from "../setup/sign-in";

test.afterAll(closeTestDb);

// Payments (docs/product/ux.md#expenses): record one, see the month total, delete it.
test("records a payment, totals the month and deletes it", async ({
  page,
  context,
}) => {
  await signIn(context);
  await page.goto("/settings/expenses?month=2001-02");
  await expect(page.getByText("这个月还没有记账")).toBeVisible();

  await page.getByLabel("日期").fill("2001-02-03");
  await page.getByLabel("金额").fill("12.5");
  await page.getByLabel("类别").selectOption("domain");
  await page.getByLabel("说明").fill("e2e renewal");
  await page.getByRole("button", { name: "记一笔" }).click();

  const row = page
    .getByTestId("expense-row")
    .filter({ hasText: "e2e renewal" });
  await expect(row).toContainText("2001-02-03");
  await expect(row).toContainText("域名");
  await expect(row).toContainText("12.50");
  await expect(page.getByTestId("expense-total")).toContainText("12.50");

  await row.getByRole("button", { name: "删除" }).click();
  await expect(page.getByText("这个月还没有记账")).toBeVisible();
});

test("expenses need a session", async ({ page }) => {
  await page.goto("/settings/expenses");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fsettings%2Fexpenses$/);
});
