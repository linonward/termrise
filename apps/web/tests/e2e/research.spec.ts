import { expect, test } from "@playwright/test";

import { closeTestDb } from "@repo/db/testing/db";

import { signIn } from "../setup/sign-in";

test.afterAll(closeTestDb);

test("creates, edits and deletes a draft research project", async ({
  page,
  context,
}) => {
  await signIn(context);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/opportunities/research");
  await expect(page).toHaveTitle("研究 · Termrise");
  await expect(page.getByText("还没有研究项目")).toBeVisible();
  await expect(page.getByText("美国 · 英语")).toBeVisible();

  await page.getByLabel("名称").fill("AI meeting notes");
  await page
    .getByLabel("种子词")
    .fill("AI Meeting Notes\nai meeting notes\n sales call summary ");
  await page.getByRole("button", { name: "创建项目" }).click();

  await expect(page).toHaveURL(/\/opportunities\/research\/[0-9a-f-]{36}$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "AI meeting notes" }),
  ).toBeVisible();
  await expect(
    page.getByRole("main").getByText("草稿", { exact: true }),
  ).toBeVisible();
  // Seeds are normalized and de-duplicated by the API.
  await expect(page.locator('textarea[name="seeds"]')).toHaveValue(
    "ai meeting notes\nsales call summary",
  );
  await expect(page.getByText("$20.00")).toBeVisible();

  await page.getByLabel("数据预算（美元）").fill("7.5");
  await page.getByRole("button", { name: "保存修改" }).click();
  await expect(page.getByRole("status")).toHaveText("已保存。");
  await expect(page.getByText("$7.50")).toBeVisible();

  await page.getByRole("link", { name: "研究项目" }).first().click();
  await expect(page.getByTestId("research-project-row")).toHaveCount(1);
  await page.getByRole("link", { name: "AI meeting notes" }).click();

  await page.getByRole("button", { name: "删除项目" }).click();
  await page.getByRole("button", { name: "确认删除" }).click();
  await expect(page).toHaveURL(/\/opportunities\/research$/);
  await expect(page.getByText("还没有研究项目")).toBeVisible();
  expect(errors).toEqual([]);
});

test("shows a validation error from the API", async ({ page, context }) => {
  await signIn(context);
  await page.goto("/opportunities/research");
  await page.getByLabel("名称").fill("Empty seeds");
  // Only blank lines: the browser accepts it, the API rejects it.
  await page.locator('textarea[name="seeds"]').fill(" \n ");
  await page.getByRole("button", { name: "创建项目" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    "提交的信息有误，请检查后重试。",
  );
});

test("another user's project is not found", async ({ page, browser }) => {
  const owner = await browser.newContext();
  await signIn(owner);
  const ownerPage = await owner.newPage();
  await ownerPage.goto("/opportunities/research");
  await ownerPage.getByLabel("名称").fill("Private project");
  await ownerPage.locator('textarea[name="seeds"]').fill("secret seed");
  await ownerPage.getByRole("button", { name: "创建项目" }).click();
  await expect(ownerPage).toHaveURL(
    /\/opportunities\/research\/[0-9a-f-]{36}$/,
  );
  const url = ownerPage.url();
  await owner.close();

  await signIn(page.context());
  const response = await page.goto(url);
  expect(response?.status()).toBe(404);
});

test("research pages need a session", async ({ page }) => {
  await page.goto("/opportunities/research");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fopportunities%2Fresearch$/);
});

test("imports terms from a CSV into a draft", async ({ page, context }) => {
  await signIn(context);
  await page.goto("/opportunities/research");
  await page.getByLabel("名称").fill("Imported project");
  await page.locator('textarea[name="seeds"]').fill("first seed");
  await page.getByRole("button", { name: "创建项目" }).click();
  await expect(page).toHaveURL(/\/opportunities\/research\/[0-9a-f-]{36}$/);
  await expect(page.getByText("还没有信号。", { exact: false })).toBeVisible();

  const file = {
    name: "terms.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "term,url,observed_at,source\n" +
        "AI Note Taker,https://example.com/a,2026-10-01,Trends export\n" +
        "first seed,,,\n" +
        "broken,ftp://example.com,,\n",
    ),
  };
  await page.getByLabel("CSV 文件").setInputFiles(file);
  await page.getByRole("button", { name: "导入" }).click();
  await expect(page.getByRole("status")).toContainText(
    "导入 2 个词，0 个重复，跳过 1 行。新增 1 个种子词。",
  );
  await expect(page.getByRole("status")).toContainText(
    "第 4 行：url 不是 http(s) 链接",
  );
  await expect(page.getByTestId("signal-row")).toHaveCount(2);
  await expect(page.getByRole("cell", { name: "Trends export" })).toBeVisible();
  await expect(page.locator('textarea[name="seeds"]')).toHaveValue(
    "first seed\nai note taker",
  );

  // The same file again: every row is a duplicate.
  await page.getByLabel("CSV 文件").setInputFiles(file);
  await page.getByRole("button", { name: "导入" }).click();
  await expect(page.getByRole("status")).toContainText("导入 0 个词，2 个重复");
  await expect(page.getByTestId("signal-row")).toHaveCount(2);
});

async function createProject(
  page: import("@playwright/test").Page,
  name: string,
  seeds: string,
) {
  await page.goto("/opportunities/research");
  await page.getByLabel("名称").fill(name);
  await page.locator('textarea[name="seeds"]').fill(seeds);
  await page.getByRole("button", { name: "创建项目" }).click();
  await expect(page).toHaveURL(/\/opportunities\/research\/[0-9a-f-]{36}$/);
}

test("runs research and shows keywords, metrics and search results", async ({
  page,
  context,
}) => {
  await signIn(context);
  await createProject(page, "Run project", "meeting notes");
  await expect(
    page.getByText("还没有关键词。", { exact: false }),
  ).toBeVisible();

  await page.getByRole("button", { name: "运行研究" }).click();
  await expect(
    page
      .getByRole("main")
      .locator("header")
      .getByText("已完成", { exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("last-run")).toContainText("已完成");
  // Fixture data is labelled as such.
  await expect(page.getByTestId("fixture-notice")).toContainText(
    "不是真实的搜索数据",
  );
  await expect(page.getByTestId("keyword-row")).toHaveCount(8);
  await expect(
    page.getByTestId("keyword-row").filter({ hasText: "种子词" }),
  ).toHaveCount(1);
  await expect(
    page.getByTestId("serp").first().getByRole("listitem"),
  ).toHaveCount(10);
  // Running locks the project: no run, import or delete, and the form is read-only.
  await expect(page.getByRole("button", { name: "运行研究" })).toHaveCount(0);
  await expect(page.getByLabel("CSV 文件")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "删除项目" })).toHaveCount(0);
  await expect(page.locator('textarea[name="seeds"]')).toBeDisabled();
});

test("shows a failed run and offers to run it again", async ({
  page,
  context,
}) => {
  await signIn(context);
  // The fake provider fails on seeds with [fail].
  await createProject(page, "Failing project", "broken [fail]");
  await page.getByRole("button", { name: "运行研究" }).click();
  await expect(page.getByTestId("last-run")).toContainText("失败");
  await expect(page.getByText("关键词数据来源没有响应。")).toBeVisible();
  await expect(
    page.getByText("上次运行失败了。", { exact: false }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "运行研究" })).toBeVisible();
});

test("says when the data source refused the key, and that nothing was charged", async ({
  page,
  context,
}) => {
  await signIn(context);
  // The fake provider refuses the key on seeds with [auth-fail].
  await createProject(page, "Locked project", "locked [auth-fail]");
  await page.getByRole("button", { name: "运行研究" }).click();
  await expect(page.getByTestId("last-run")).toContainText("失败");
  await expect(
    page.getByText("关键词数据源拒绝了 API Key。", {
      exact: false,
    }),
  ).toBeVisible();
});

test("shows the budget used and stops a run the budget cannot cover", async ({
  page,
  context,
}) => {
  await signIn(context);
  await page.goto("/opportunities/research");
  await page.getByLabel("名称").fill("Budget project");
  await page.locator('textarea[name="seeds"]').fill("meeting notes");
  await page.getByLabel("数据预算（美元）").fill("0");
  await page.getByRole("button", { name: "创建项目" }).click();
  await expect(page).toHaveURL(/\/opportunities\/research\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId("summaryDataBudget-used")).toHaveText(
    "已花费 US$0.00 · 预留 US$0.00",
  );

  await page.getByRole("button", { name: "运行研究" }).click();
  await expect(page.getByTestId("last-run")).toContainText("失败");
  await expect(
    page.getByText("数据预算不够一次扩词。", {
      exact: true,
    }),
  ).toBeVisible();

  // Raise the budget, then the run goes through and its cost shows.
  await page.getByLabel("数据预算（美元）").fill("5");
  await page.getByRole("button", { name: "保存修改" }).click();
  await expect(page.getByText("已保存。")).toBeVisible();
  await page.getByRole("button", { name: "运行研究" }).click();
  await expect(page.getByTestId("last-run")).toContainText("已完成");
  await expect(page.getByTestId("summaryDataBudget-used")).not.toHaveText(
    "已花费 US$0.00 · 预留 US$0.00",
  );
});

test("cancels a running run and offers to run it again", async ({
  page,
  context,
}) => {
  await signIn(context);
  // The fake provider takes seconds on seeds with [slow].
  await createProject(page, "Slow project", "notes [slow]");
  await page.getByRole("button", { name: "运行研究" }).click();
  await page.getByRole("button", { name: "取消运行" }).click();
  await expect(page.getByTestId("last-run")).toContainText("已取消");
  await expect(
    page.getByText("上次运行已取消。可以再运行一次。"),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "取消运行" })).toHaveCount(0);
});
