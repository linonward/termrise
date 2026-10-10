import { expect, test } from "@playwright/test";

import { closeTestDb } from "@repo/db/testing/db";

import { signIn } from "../setup/sign-in";

test.afterAll(closeTestDb);

test("shows the worker's services and the spending of a run", async ({
  page,
  context,
}) => {
  await signIn(context);
  await page.goto("/settings/providers");
  // The E2E worker runs the fake providers and writes its heartbeat at start.
  await expect(page.getByTestId("service-worker")).toContainText("Online");
  await expect(page.getByTestId("service-keywords")).toContainText("Test data");
  await expect(page.getByTestId("service-radar")).toContainText("Off");
  await expect(
    page.getByText("Your projects have made no paid calls yet."),
  ).toBeVisible();

  await page.goto("/research");
  await page.getByLabel("Name").fill("Spending project");
  await page.getByLabel("Seed terms").fill("meeting notes");
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page).toHaveURL(/\/research\/[0-9a-f-]{36}$/);
  await page.getByRole("button", { name: "Run research" }).click();
  await expect(page.getByTestId("last-run")).toContainText("Completed");

  await page.goto("/settings/providers");
  await expect(page.getByTestId("usage-row")).toHaveCount(2);
  await expect(page.getByTestId("usage-row").first()).toContainText("OK");
});

test("provider settings need a session", async ({ page }) => {
  await page.goto("/settings/providers");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fsettings%2Fproviders$/);
});
