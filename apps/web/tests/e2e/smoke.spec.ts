import { expect, test } from "@playwright/test";

test("home page renders the product name", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("Acme: Pay-as-you-go AI tool");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});
