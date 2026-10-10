import { expect, test } from "@playwright/test";

test("home page renders the product name", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(
    "Termrise: Find rising search terms worth building for",
  );
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});
