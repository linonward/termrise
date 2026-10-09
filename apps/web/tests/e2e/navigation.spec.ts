import { expect, test, type Page } from "@playwright/test";

import { closeTestDb } from "@repo/db/testing/db";

import { signIn } from "../setup/sign-in";

test.afterAll(closeTestDb);

async function openMenu(page: Page, isMobile: boolean) {
  await page
    .getByRole("button", { name: isMobile ? "Open menu" : "Account menu" })
    .click();
}

test("navigation shows links, credits and the user menu", async ({
  page,
  context,
  isMobile,
}) => {
  const { email } = await signIn(context);
  await page.goto("/dashboard");
  await expect(page.getByTestId("nav-credits")).toHaveText("10 credits");
  if (isMobile) await openMenu(page, isMobile);
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  for (const name of ["Dashboard", "Billing"])
    await expect(nav.getByRole("link", { name })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Dashboard" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  if (!isMobile) await openMenu(page, isMobile);
  await expect(page.getByText(email)).toBeVisible();
});

test("switches language and remembers it in a cookie", async ({
  page,
  context,
  isMobile,
}) => {
  await signIn(context);
  await page.goto("/dashboard");
  await openMenu(page, isMobile);
  await page
    .getByRole(isMobile ? "button" : "menuitemradio", { name: "简体中文" })
    .click();
  // The drawer is modal: close it so the page behind is exposed again.
  if (isMobile) await page.keyboard.press("Escape");
  await expect(
    page.getByRole("heading", { level: 1, name: /^欢迎回来/ }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh");
  await expect(page.getByTestId("nav-credits")).toHaveText("10 积分");
  const cookies = await context.cookies();
  expect(cookies.find((c) => c.name === "NEXT_LOCALE")?.value).toBe("zh");
  await page.reload();
  await expect(
    page.getByRole("heading", { level: 1, name: /^欢迎回来/ }),
  ).toBeVisible();
});

test("switches theme and logs out from the menu", async ({
  page,
  context,
  isMobile,
}) => {
  await signIn(context);
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/dashboard");
  await openMenu(page, isMobile);
  await page
    .getByRole(isMobile ? "button" : "menuitemradio", { name: "Dark" })
    .click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  if (isMobile) await page.keyboard.press("Escape");
  await openMenu(page, isMobile);
  await page
    .getByRole(isMobile ? "button" : "menuitem", { name: "Log out" })
    .click();
  await expect(page).toHaveURL(/\/sign-in/);
});

test("navigates between dashboard pages", async ({
  page,
  context,
  isMobile,
}) => {
  await signIn(context);
  await page.goto("/dashboard");
  if (isMobile) await openMenu(page, isMobile);
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Billing" })
    .click();
  await expect(page).toHaveURL(/\/billing$/);
  await expect(page.getByRole("heading", { name: "Billing" })).toBeVisible();
  if (isMobile) await openMenu(page, isMobile);
  await expect(
    page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("link", { name: "Billing" }),
  ).toHaveAttribute("aria-current", "page");
});

test("marketing nav links pricing and the blog", async ({ page, isMobile }) => {
  test.skip(isMobile, "The marketing nav links are desktop only.");
  await page.goto("/blog");
  const nav = page.getByRole("navigation", { name: "Site navigation" });
  const links = nav.getByRole("link");
  for (const [index, [name, href]] of [
    ["Pricing", "/pricing"],
    ["Blog", "/blog"],
  ].entries()) {
    await expect(links.nth(index)).toHaveText(name);
    await expect(links.nth(index)).toHaveAttribute("href", href);
  }
  await expect(nav.getByRole("link", { name: "Blog" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await nav.getByRole("link", { name: "Pricing" }).click();
  await expect(page).toHaveURL(/\/pricing$/);
});
