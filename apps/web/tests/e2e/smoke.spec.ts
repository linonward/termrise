import { expect, test } from "@playwright/test";

test("home page renders the product name", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("Termrise：发现值得做产品的英文上升热词");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});
