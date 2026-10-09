import { expect, test } from "@playwright/test";

test("protects nested dashboard paths and preserves the return path", async ({
  page,
}) => {
  await page.goto("/billing?checkout=success");
  await expect(page).toHaveURL(
    /\/sign-in\?next=%2Fbilling%3Fcheckout%3Dsuccess/,
  );
  await expect(
    page.getByRole("heading", { name: "Welcome back" }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "New to Acme? Create an account" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Create your account" }),
  ).toBeVisible();
});

test("requests a magic link using a safe return URL and displays delivery state", async ({
  page,
}) => {
  await page.route("**/api/auth/sign-in/magic-link", async (route) => {
    expect(route.request().postDataJSON()).toMatchObject({
      callbackURL: "/dashboard",
      email: "test@example.com",
    });
    await route.fulfill({ json: { status: true } });
  });
  await page.goto("/sign-in?next=https://evil.example");
  await page.getByLabel("Email address").fill("test@example.com");
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(
    page.getByRole("heading", { name: "Check your email" }),
  ).toBeVisible();
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
  await page.getByLabel("Email address").fill("test@example.com");
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    "Email sign-in is unavailable for the rest of today. Continue with Google instead.",
  );
});

test("shows a localized retry message without exposing API errors", async ({
  page,
  context,
}) => {
  await context.addCookies([
    { name: "NEXT_LOCALE", value: "zh", domain: "localhost", path: "/" },
  ]);
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
  await expect(alert).toHaveText(
    "This sign-in link is invalid or has expired. Request a new one.",
  );
  const title = await page
    .getByRole("heading", { name: "Welcome back" })
    .boundingBox();
  const google = await page
    .getByRole("button", { name: "Continue with Google" })
    .boundingBox();
  const box = await alert.boundingBox();
  expect(box!.y).toBeGreaterThan(title!.y);
  expect(box!.y).toBeLessThan(google!.y);
});

test("shows the free credits note next to the form", async ({ page }) => {
  const note = page
    .getByText("10 free credits when you sign up · No card required")
    .filter({ visible: true });
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
  const google = page.getByRole("button", { name: /Continue with Google/ });
  await page.goto("/sign-in");
  await expect(google).toBeVisible();
  await expect(page.getByText("Last used")).toHaveCount(0);

  await context.addCookies([
    {
      name: "better-auth.last_used_login_method",
      value: "magic-link",
      url: baseURL!,
    },
  ]);
  await page.reload();
  await expect(page.getByText("Last used")).toHaveCount(0);

  await context.addCookies([
    {
      name: "better-auth.last_used_login_method",
      value: "google",
      url: baseURL!,
    },
  ]);
  await page.reload();
  await expect(google).toHaveAccessibleName("Continue with Google (Last used)");
});
