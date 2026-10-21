import { expect, test } from "@playwright/test";

import { closeTestDb } from "@repo/db/testing/db";

import { signIn } from "../setup/sign-in";

test.afterAll(closeTestDb);

test("shows the worker's services and the spending of a run", async ({
  page,
  context,
}) => {
  await signIn(context);
  await page.goto("/settings/providers");
  // The E2E worker runs the fake providers and writes its heartbeat at start.
  await expect(page.getByTestId("service-worker")).toContainText("在线");
  await expect(page.getByTestId("service-keywords")).toContainText("测试数据");
  await expect(page.getByTestId("service-radar")).toContainText("关闭");
  await expect(page.getByText("你的项目还没有付费调用。")).toBeVisible();

  await page.goto("/research");
  await page.getByLabel("名称").fill("Spending project");
  await page.locator('textarea[name="seeds"]').fill("meeting notes");
  await page.getByRole("button", { name: "创建项目" }).click();
  await expect(page).toHaveURL(/\/research\/[0-9a-f-]{36}$/);
  await page.getByRole("button", { name: "运行研究" }).click();
  await expect(page.getByTestId("last-run")).toContainText("已完成");

  await page.goto("/settings/providers");
  await expect(page.getByTestId("usage-row")).toHaveCount(2);
  await expect(page.getByTestId("usage-row").first()).toContainText("成功");
});

test("provider settings need a session", async ({ page }) => {
  await page.goto("/settings/providers");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fsettings%2Fproviders$/);
});
