import { expect, test } from "@playwright/test";

test("unknown URLs show the 404 page with links home and to the dashboard", async ({
  page,
}) => {
  const response = await page.goto("/no-such-page");
  expect(response?.status()).toBe(404);
  await expect(
    page.getByRole("heading", { name: "Page not found" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Go to homepage" }),
  ).toHaveAttribute("href", "/");
  await expect(
    page.getByRole("link", { name: "Go to dashboard" }),
  ).toHaveAttribute("href", "/dashboard");
});
