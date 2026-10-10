import { expect, test } from "@playwright/test";

import { closeTestDb } from "@repo/db/testing/db";

import { signIn } from "../setup/sign-in";

test.afterAll(closeTestDb);

test("a research run ranks opportunities with their score and evidence", async ({
  page,
  context,
  browser,
}) => {
  await signIn(context);
  await page.goto("/opportunities");
  await expect(page.getByText("No opportunities yet")).toBeVisible();

  await page.goto("/research");
  await page.getByLabel("Name").fill("Opportunity project");
  await page.getByLabel("Seed terms").fill("meeting notes\ninvoice tool");
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page).toHaveURL(/\/research\/[0-9a-f-]{36}$/);
  await page.getByRole("button", { name: "Run research" }).click();
  await expect(page.getByTestId("last-run")).toContainText("Completed");

  await page.getByRole("link", { name: "View opportunities" }).click();
  await expect(page).toHaveURL(/\/opportunities\?project=/);
  await expect(page.getByTestId("opportunity-row")).toHaveCount(2);
  await expect(page.getByTestId("fixture-notice")).toBeVisible();

  await page
    .getByTestId("opportunity-row")
    .first()
    .getByRole("link")
    .first()
    .click();
  await expect(page).toHaveURL(/\/opportunities\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId("opportunity-score")).toContainText("/100");
  await expect(page.getByTestId("dimension-row")).toHaveCount(6);
  await expect(page.getByTestId("analysis")).toContainText("MVP scope");
  await expect(page.getByTestId("keyword-row")).toHaveCount(8);
  await expect(page.getByTestId("serp").first()).toBeVisible();

  // Another user does not see it.
  const other = await browser.newContext();
  await signIn(other);
  const response = await (await other.newPage()).goto(page.url());
  expect(response?.status()).toBe(404);
  await other.close();
});

test("opportunity pages need a session", async ({ page }) => {
  await page.goto("/opportunities");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fopportunities$/);
});
