import { expect, test } from "@playwright/test";

test("unknown URLs show the 404 page with links home and to the dashboard", async ({
  page,
}) => {
  const response = await page.goto("/no-such-page");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "页面不存在" })).toBeVisible();
  await expect(page.getByRole("link", { name: "返回首页" })).toHaveAttribute(
    "href",
    "/",
  );
  await expect(page.getByRole("link", { name: "返回控制台" })).toHaveAttribute(
    "href",
    "/dashboard",
  );
});
