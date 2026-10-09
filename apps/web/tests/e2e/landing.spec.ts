import { expect, test } from "@playwright/test";

test("landing shows every section and links to signup", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("Acme: Pay-as-you-go AI tool");
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Describe what you need. Get the result in seconds.",
    }),
  ).toBeVisible();
  for (const name of [
    "Three steps.",
    "Simple, fair pricing.",
    "Pay per use, or subscribe.",
    "Questions, answered.",
    "Ready to try it?",
  ])
    await expect(page.getByRole("heading", { level: 2, name })).toBeVisible();

  const ctas = page.getByRole("main").getByRole("link", {
    name: "Get started free",
    exact: true,
  });
  await expect(ctas).toHaveCount(2);
  await ctas.first().click();
  await expect(page).toHaveURL(/\/sign-up$/);
});

test("public pages no longer say there is no subscription", async ({
  page,
}) => {
  for (const path of ["/", "/pricing", "/terms", "/refund-policy"]) {
    await page.goto(path);
    await expect(page.locator("body")).not.toContainText(/no subscription/i);
  }
});

test("FAQ answers expand on click", async ({ page }) => {
  await page.goto("/");
  const question = page.getByText("What happens if a run fails?");
  const answer = page.getByText("Your credits are refunded automatically.");
  await expect(answer).toBeHidden();
  await question.click();
  await expect(answer).toBeVisible();
});

test("footer switches the landing page to Chinese", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("contentinfo")
    .getByRole("button", { name: "Language" })
    .click();
  await page.getByRole("menuitemradio", { name: "简体中文" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: /写下你的需求/ }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh");
  await expect(
    page.getByRole("main").getByRole("link", { name: "免费开始", exact: true }),
  ).toHaveCount(2);
});

test("footer switches the theme", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  await page
    .getByRole("contentinfo")
    .getByRole("button", { name: "Theme" })
    .click();
  await page.getByRole("menuitemradio", { name: "Dark" }).click();
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
