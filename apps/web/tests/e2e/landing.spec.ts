import { expect, test } from "@playwright/test";

import product from "../../../../product.config";

test("landing shows every section and links to signup", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("Termrise：发现值得做产品的英文上升热词");
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: /^发现正在增长的需求，\s*做人们正在搜索的产品。$/,
    }),
  ).toBeVisible();
  for (const name of [
    "从上升热词到第一笔订单。",
    "先有证据，再投入时间。",
    "常见问题解答。",
    "找到你的下一个产品点子。",
  ])
    await expect(page.getByRole("heading", { level: 2, name })).toBeVisible();
  // Pricing only while the product charges (product.config.ts billingEnabled).
  await expect(page.locator("#pricing")).toHaveCount(
    product.billingEnabled ? 1 : 0,
  );

  const ctas = page.getByRole("main").getByRole("link", {
    name: "免费开始",
    exact: true,
  });
  await expect(ctas).toHaveCount(2);
  await ctas.first().click();
  await expect(page).toHaveURL(/\/sign-up$/);
});

test("public pages no longer say there is no subscription", async ({
  page,
}) => {
  for (const path of ["/", "/terms"]) {
    await page.goto(path);
    await expect(page.locator("body")).not.toContainText(/no subscription/i);
  }
});

test("FAQ answers expand on click", async ({ page }) => {
  await page.goto("/");
  const question = page.getByText("数据来自哪里？");
  const answer = page.getByText(/Termrise 不会未经授权抓取网站/);
  await expect(answer).toBeHidden();
  await question.click();
  await expect(answer).toBeVisible();
});

test("footer switches the theme", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  await page
    .getByRole("contentinfo")
    .getByRole("button", { name: "主题" })
    .click();
  await page.getByRole("menuitemradio", { name: "深色" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
});

// One Tap code loads only after the first interaction (components/auth/google-one-tap.tsx).
test("the landing page loads the One Tap client only after an interaction", async ({
  page,
}) => {
  await page.route("https://accounts.google.com/**", (route) => route.abort());
  const oneTap: string[] = [];
  page.on("response", async (response) => {
    if (!response.url().endsWith(".js")) return;
    const body = await response.text().catch(() => "");
    if (body.includes("accounts.google.com/gsi/client"))
      oneTap.push(response.url());
  });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  expect(oneTap).toEqual([]);
  await page.keyboard.press("Tab");
  await expect.poll(() => oneTap.length).toBeGreaterThan(0);
});
