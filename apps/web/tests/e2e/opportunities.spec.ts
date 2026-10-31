import { expect, test } from "@playwright/test";

import { closeTestDb } from "@repo/db/testing/db";

import { signIn } from "../setup/sign-in";

test.afterAll(closeTestDb);

test("a research run ranks opportunities with their score and evidence", async ({
  page,
  context,
  browser,
}) => {
  await signIn(context);
  await page.goto("/opportunities");
  await expect(page.getByText("还没有机会")).toBeVisible();

  await page.goto("/opportunities/research");
  await page.getByLabel("名称").fill("Opportunity project");
  await page
    .locator('textarea[name="seeds"]')
    .fill("meeting notes\ninvoice tool");
  await page.getByRole("button", { name: "创建项目" }).click();
  await expect(page).toHaveURL(/\/opportunities\/research\/[0-9a-f-]{36}$/);
  await page.getByRole("button", { name: "运行研究" }).click();
  await expect(page.getByTestId("last-run")).toContainText("已完成");

  await page.getByRole("link", { name: "查看机会" }).click();
  await expect(page).toHaveURL(/\/opportunities\?project=/);
  await expect(page.getByTestId("opportunity-row")).toHaveCount(2);
  await expect(page.getByTestId("fixture-notice")).toBeVisible();
  // Star the first one; the starred filter shows only it.
  const saved = page.waitForResponse(
    (r) => r.url().endsWith("/star") && r.request().method() === "PUT",
  );
  await page.getByTestId("star-button").first().click();
  expect((await saved).ok()).toBe(true);
  await expect(page.getByTestId("star-button").first()).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("link", { name: "只看收藏" }).click();
  await expect(page.getByTestId("opportunity-row")).toHaveCount(1);
  await page.getByRole("link", { name: "全部机会" }).click();
  await expect(page.getByTestId("opportunity-row")).toHaveCount(2);

  // Compare both, side by side.
  for (const box of await page
    .getByRole("checkbox", { name: /进行比较$/ })
    .all())
    await box.check();
  await page.getByRole("button", { name: "比较所选" }).click();
  await expect(page).toHaveURL(/\/opportunities\/compare\?id=/);
  await expect(
    page.getByRole("columnheader", { name: "meeting notes" }),
  ).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "invoice tool" }),
  ).toBeVisible();
  await expect(page.getByRole("rowheader", { name: "月搜索量" })).toBeVisible();
  await expect(page.getByTestId("compare-row")).toHaveCount(21);
  const compareUrl = page.url();
  await page.goBack();
  await expect(page.getByTestId("opportunity-row")).toHaveCount(2);

  await page.getByRole("link", { name: "meeting notes", exact: true }).click();
  await expect(page).toHaveURL(/\/opportunities\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId("build-advice-panel")).toBeVisible();
  await expect(page.getByTestId("serp-competition")).toContainText(
    "的前 10 个结果",
  );
  await expect(page.getByTestId("opportunity-score")).toContainText("/100");
  await expect(page.getByTestId("dimension-row")).toHaveCount(6);
  await expect(page.getByTestId("analysis")).toContainText("MVP 范围");
  await expect(page.getByTestId("keyword-row")).toHaveCount(8);
  await expect(page.getByTestId("serp").first()).toBeVisible();

  // Another user does not see it, nor can compare it.
  const other = await browser.newContext();
  await signIn(other);
  const otherPage = await other.newPage();
  const response = await otherPage.goto(page.url());
  expect(response?.status()).toBe(404);
  await otherPage.goto(compareUrl);
  await expect(
    otherPage.getByText("请在列表中选择 2 到 4 个你的机会"),
  ).toBeVisible();
  await other.close();
});

test("opportunity pages need a session", async ({ page }) => {
  await page.goto("/opportunities");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fopportunities$/);
});

test("decides with a reason after planning and running an experiment", async ({
  page,
  context,
}) => {
  await signIn(context);
  await page.goto("/opportunities/research");
  await page.getByLabel("名称").fill("Decision project");
  await page.locator('textarea[name="seeds"]').fill("meeting notes");
  await page.getByRole("button", { name: "创建项目" }).click();
  await page.getByRole("button", { name: "运行研究" }).click();
  await page.getByRole("link", { name: "查看机会" }).click();
  await page
    .getByTestId("opportunity-row")
    .first()
    .getByRole("link")
    .first()
    .click();
  await expect(page).toHaveURL(/\/opportunities\/[0-9a-f-]{36}$/);

  // Go needs validation first: it is not offered yet.
  await expect(page.getByLabel("Go：开发")).toHaveCount(0);
  await page.getByLabel("先验证").check();
  await page.getByLabel("理由").fill("Demand is there, test payment");
  await page.getByRole("button", { name: "保存决策" }).click();
  await expect(page.getByTestId("decision")).toHaveCount(1);
  await expect(page.getByTestId("decision")).toContainText(
    "Demand is there, test payment",
  );

  await page.getByText("计划实验").click();
  await page.getByLabel("类型").selectOption("landing_smoke_test");
  await page.getByLabel("假设").fill("Reps pay for summaries");
  await page.getByLabel("渠道").fill("r/sales");
  await page.getByLabel("计数的事件").fill("付费预订");
  await page.getByLabel("成功阈值").fill("3 pre-orders");
  await page.getByLabel("停止条件").fill("None after 300 visitors");
  await page.getByRole("button", { name: "添加实验" }).click();
  await expect(page.getByTestId("experiment")).toHaveCount(1);
  await expect(page.getByTestId("experiment-status")).toHaveText("已计划");

  await page.getByLabel("新状态").selectOption("running");
  await page.getByRole("button", { name: "更新" }).click();
  await expect(page.getByTestId("experiment-status")).toHaveText("进行中");

  await page.getByLabel("Go：开发").check();
  await page.getByLabel("理由").fill("4 pre-orders in a week");
  await page.getByRole("button", { name: "保存决策" }).click();
  await expect(page.getByTestId("decision")).toHaveCount(2);
  await expect(page.getByTestId("decision").first()).toContainText("Go");
  await expect(page.getByLabel("Go：开发")).toHaveCount(0);

  // The brief includes the decision and the experiment, and downloads as Markdown.
  await page.getByText("预览").click();
  const preview = page.getByTestId("brief-preview");
  await expect(preview).toContainText("# Product Brief: meeting notes");
  await expect(preview).toContainText("4 pre-orders in a week");
  await expect(preview).toContainText("Reps pay for summaries");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "下载 Markdown" }).click();
  expect((await download).suggestedFilename()).toBe("brief-meeting-notes.md");
});

test("starts a product from a Go opportunity and records its results", async ({
  page,
  context,
}) => {
  await signIn(context);
  await page.goto("/opportunities/research");
  await page.getByLabel("名称").fill("Product project");
  await page.locator('textarea[name="seeds"]').fill("invoice tool");
  await page.getByRole("button", { name: "创建项目" }).click();
  await page.getByRole("button", { name: "运行研究" }).click();
  await page.getByRole("link", { name: "查看机会" }).click();
  await page
    .getByTestId("opportunity-row")
    .first()
    .getByRole("link")
    .first()
    .click();
  for (const [label, reason] of [
    ["先验证", "Test it"],
    ["Go：开发", "Pre-orders"],
  ]) {
    await page.getByLabel(label).check();
    await page.getByLabel("理由").fill(reason);
    await page.getByRole("button", { name: "保存决策" }).click();
    await expect(page.getByTestId("decision").first()).toContainText(reason);
  }

  await page.getByRole("button", { name: "开始产品" }).click();
  await expect(page).toHaveURL(/\/products\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId("product-status")).toHaveText("未开始");

  // A launched product needs its launch date.
  await page.getByLabel("状态").selectOption("launched");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await page.getByLabel("上线日期", { exact: true }).fill("2026-10-12");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByTestId("product-status")).toHaveText("已上线");

  await page.getByText("记录访客或激活").first().click();
  await page.getByLabel("数量", { exact: true }).fill("300");
  await page.getByLabel("开始", { exact: true }).fill("2026-10-12");
  await page.getByLabel("结束", { exact: true }).fill("2026-10-18");
  await page.getByRole("button", { name: "记录访客或激活" }).click();
  await expect(page.getByTestId("total-visitors")).toHaveText("300");

  await page.getByText("记录收入").first().click();
  await page.getByLabel("日期", { exact: true }).fill("2026-10-15");
  await page.getByLabel("订单", { exact: true }).fill("2");
  await page.getByLabel("毛收入", { exact: true }).fill("18");
  await page.getByRole("button", { name: "记录收入" }).click();
  const total = page.getByTestId("revenue-total");
  await expect(total).toContainText("USD");
  await expect(total).toContainText("$18.00");
  // Fees were left empty: net stays unknown, and the order is manual.
  await expect(total).toContainText("未知");
  await expect(page.getByTestId("revenue-row")).toContainText("手工");

  await page.goto("/products");
  await expect(page.getByTestId("product-row")).toHaveCount(1);
});
