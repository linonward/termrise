import { expect, test, type Page } from "@playwright/test";

import { closeTestDb } from "@repo/db/testing/db";

import product from "../../../../product.config";
import { signIn } from "../setup/sign-in";

test.afterAll(closeTestDb);

async function openMenu(page: Page, isMobile: boolean) {
  await page
    .getByRole("button", { name: isMobile ? "打开菜单" : "账号菜单" })
    .click();
}

test("navigation shows links, credits and the user menu", async ({
  page,
  context,
  isMobile,
}) => {
  const { email } = await signIn(context);
  await page.goto("/today");
  // Credits and Billing only while the product charges (product.config.ts billingEnabled).
  if (product.billingEnabled)
    await expect(page.getByTestId("nav-credits")).toHaveText("10 积分");
  else await expect(page.getByTestId("nav-credits")).toHaveCount(0);
  if (isMobile) await openMenu(page, isMobile);
  const nav = page.getByRole("navigation", { name: "主导航" });
  await expect(nav.getByRole("link", { name: "今天" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "账单" })).toHaveCount(
    product.billingEnabled ? 1 : 0,
  );
  await expect(nav.getByRole("link", { name: "今天" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  if (!isMobile) await openMenu(page, isMobile);
  await expect(page.getByText(email)).toBeVisible();
});

// The UI is Chinese only: no language menu (docs/product/ux.md#internationalization).
test("shows the app in Chinese without a language menu", async ({
  page,
  context,
  isMobile,
}) => {
  await signIn(context);
  await page.goto("/today");
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await openMenu(page, isMobile);
  await expect(page.getByText("语言")).toHaveCount(0);
  await expect(
    page.getByRole(isMobile ? "button" : "menuitemradio", { name: "深色" }),
  ).toBeVisible();
});

test("switches theme and logs out from the menu", async ({
  page,
  context,
  isMobile,
}) => {
  await signIn(context);
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/today");
  await openMenu(page, isMobile);
  await page
    .getByRole(isMobile ? "button" : "menuitemradio", { name: "深色" })
    .click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  if (isMobile) await page.keyboard.press("Escape");
  await openMenu(page, isMobile);
  await page
    .getByRole(isMobile ? "button" : "menuitem", { name: "退出登录" })
    .click();
  await expect(page).toHaveURL(/\/sign-in/);
});

test("navigates between dashboard pages", async ({
  page,
  context,
  isMobile,
}) => {
  test.skip(
    !product.billingEnabled,
    "billing is disabled in product.config.ts",
  );
  await signIn(context);
  await page.goto("/today");
  if (isMobile) await openMenu(page, isMobile);
  await page
    .getByRole("navigation", { name: "主导航" })
    .getByRole("link", { name: "账单" })
    .click();
  await expect(page).toHaveURL(/\/billing$/);
  await expect(page.getByRole("heading", { name: "账单" })).toBeVisible();
  if (isMobile) await openMenu(page, isMobile);
  await expect(
    page
      .getByRole("navigation", { name: "主导航" })
      .getByRole("link", { name: "账单" }),
  ).toHaveAttribute("aria-current", "page");
});

test("marketing nav links the blog, and pricing while the product charges", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "The marketing nav links are desktop only.");
  await page.goto("/blog");
  const nav = page.getByRole("navigation", { name: "网站导航" });
  const links = nav.getByRole("link");
  const expected = [
    ...(product.billingEnabled ? [["Pricing", "/pricing"]] : []),
    ["博客", "/blog"],
  ];
  await expect(links).toHaveCount(expected.length);
  for (const [index, [name, href]] of expected.entries()) {
    await expect(links.nth(index)).toHaveText(name);
    await expect(links.nth(index)).toHaveAttribute("href", href);
  }
  await expect(nav.getByRole("link", { name: "博客" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  if (!product.billingEnabled) return;
  await nav.getByRole("link", { name: "定价" }).click();
  await expect(page).toHaveURL(/\/pricing$/);
});

// The workbench's sections (S91): four links, each active on every page of its section,
// tabs inside each section, and the root opening Today when signed in.
test("the nav has the workbench's sections, each with its tabs", async ({
  page,
  context,
  isMobile,
}) => {
  await signIn(context);
  await page.goto("/");
  await expect(page).toHaveURL(/\/today$/);

  const cases: [string, string, string, string][] = [
    ["/keywords", "找词", "找词分类", "长青词"],
    ["/discover/watch", "找词", "找词分类", "盯站"],
    ["/opportunities/research", "建站", "建站分类", "研究项目"],
    ["/settings/expenses", "站群", "站群分类", "花费和续费"],
  ];
  for (const [path, section, tabs, tab] of cases) {
    await page.goto(path);
    await expect(
      page.getByRole("heading", { level: 1, name: section }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("navigation", { name: tabs })
        .getByRole("link", { name: new RegExp(tab) }),
    ).toHaveAttribute("aria-current", "page");
    if (isMobile) await openMenu(page, isMobile);
    await expect(
      page
        .getByRole("navigation", { name: "主导航" })
        .getByRole("link", { name: section }),
    ).toHaveAttribute("aria-current", "page");
    if (isMobile) await page.keyboard.press("Escape");
  }
});
