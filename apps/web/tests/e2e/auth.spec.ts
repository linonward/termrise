import { expect, test } from "@playwright/test";

test("protects nested dashboard paths and preserves the return path", async ({
  page,
}) => {
  await page.goto("/dashboard?ref=email");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fdashboard%3Fref%3Demail/);
  await expect(page.getByRole("heading", { name: "欢迎回来" })).toBeVisible();
  await page.getByRole("link", { name: "首次使用 Termrise？创建账号" }).click();
  await expect(page.getByRole("heading", { name: "创建账号" })).toBeVisible();
});

test("requests a magic link using a safe return URL and displays delivery state", async ({
  page,
}) => {
  await page.route("**/api/auth/sign-in/magic-link", async (route) => {
    // Better Auth runs on apps/api: callbacks are absolute URLs on this site.
    expect(route.request().postDataJSON()).toMatchObject({
      callbackURL: "http://localhost:3100/dashboard",
      email: "test@example.com",
    });
    await route.fulfill({ json: { status: true } });
  });
  await page.goto("/sign-in?next=https://evil.example");
  await page.getByLabel("邮箱地址").fill("test@example.com");
  await page.getByRole("button", { name: "发送登录链接" }).click();
  await expect(page.getByRole("heading", { name: "请查看邮箱" })).toBeVisible();
});

test("suggests Google when email sign-in is used up for the day", async ({
  page,
}) => {
  await page.route("**/api/auth/sign-in/magic-link", (route) =>
    route.fulfill({
      status: 429,
      json: { code: "MAGIC_LINK_DAILY_LIMIT", message: "PRIVATE" },
    }),
  );
  await page.goto("/sign-in");
  await page.getByLabel("邮箱地址").fill("test@example.com");
  await page.getByRole("button", { name: "发送登录链接" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    "今天的邮件登录已达上限，请使用 Google 登录。",
  );
});

test("shows a retry message without exposing API errors", async ({ page }) => {
  await page.route("**/api/auth/sign-in/magic-link", (route) =>
    route.fulfill({
      status: 429,
      json: { code: "TOO_MANY_REQUESTS", message: "PRIVATE SERVER DETAILS" },
    }),
  );
  await page.goto("/sign-in");
  await page.getByLabel("邮箱地址").fill("test@example.com");
  await page.getByRole("button", { name: "发送登录链接" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    "操作过于频繁，请稍等一分钟后重试。",
  );
  await expect(page.getByText("PRIVATE SERVER DETAILS")).toHaveCount(0);
});

test("shows an expired link as an alert under the title", async ({ page }) => {
  await page.goto("/sign-in?error=invalid_link");
  const alert = page.getByRole("main").getByRole("alert");
  await expect(alert).toHaveText("登录链接无效或已过期，请获取新链接。");
  const title = await page
    .getByRole("heading", { name: "欢迎回来" })
    .boundingBox();
  const google = await page
    .getByRole("button", { name: "使用 Google 登录" })
    .boundingBox();
  const box = await alert.boundingBox();
  expect(box!.y).toBeGreaterThan(title!.y);
  expect(box!.y).toBeLessThan(google!.y);
});

test("shows the early access note next to the form", async ({ page }) => {
  const note = page.getByText("抢先体验 · 无需绑卡").filter({ visible: true });
  await page.goto("/sign-up");
  await expect(note).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(note).toBeVisible();
});

test("marks Google as the last used sign-in method", async ({
  page,
  context,
  baseURL,
}) => {
  const google = page.getByRole("button", { name: /使用 Google 登录/ });
  await page.goto("/sign-in");
  await expect(google).toBeVisible();
  await expect(page.getByText("上次使用")).toHaveCount(0);

  await context.addCookies([
    {
      name: "better-auth.last_used_login_method",
      value: "magic-link",
      url: baseURL!,
    },
  ]);
  await page.reload();
  await expect(page.getByText("上次使用")).toHaveCount(0);

  await context.addCookies([
    {
      name: "better-auth.last_used_login_method",
      value: "google",
      url: baseURL!,
    },
  ]);
  await page.reload();
  await expect(google).toHaveAccessibleName(/使用 Google 登录\s*\(上次使用\)/);
});
