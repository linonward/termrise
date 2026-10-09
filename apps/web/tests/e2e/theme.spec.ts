import { expect, test } from "@playwright/test";

const backgroundOf = (page: import("@playwright/test").Page) =>
  page.evaluate(() => getComputedStyle(document.body).backgroundColor);

test("follows the system light theme by default", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  expect(await backgroundOf(page)).toBe("rgb(255, 255, 255)");
});

test("follows the system dark theme by default", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  await expect(page.locator("html")).toHaveClass(/dark/);
  expect(await backgroundOf(page)).toBe("rgb(17, 19, 24)");
});
