import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

import { createCreditService } from "@repo/credits/credit-service";
import { user } from "@repo/db/schema";
import { closeTestDb, testDb } from "@repo/db/testing/db";

import { signIn } from "../setup/sign-in";

test.afterAll(closeTestDb);

test("signed-out visitors and normal users get a 404 for every admin page", async ({
  page,
  context,
}) => {
  for (const path of ["/admin", "/admin/users/e2e-admin"])
    expect((await page.goto(path))?.status()).toBe(404);
  await signIn(context);
  for (const path of ["/admin", "/admin/users/e2e-admin"]) {
    expect((await page.goto(path))?.status()).toBe(404);
    await expect(page.getByText("Page not found")).toBeVisible();
  }
});

test("an admin finds a user by email and adjusts their credits", async ({
  page,
  context,
}) => {
  // The admin id is fixed by ADMIN_USER_IDS in tests/setup/e2e-env.ts.
  await testDb()
    .insert(user)
    .values({ id: "e2e-admin", name: "Admin", email: "admin-e2e@example.com" })
    .onConflictDoNothing();
  const targetId = `e2e-target-${randomUUID()}`;
  const targetEmail = `${targetId}@example.com`;
  await testDb()
    .insert(user)
    .values({ id: targetId, name: "Target", email: targetEmail });
  await createCreditService(testDb()).grantSignupBonus(targetId, 10);
  await signIn(context, "admin-e2e@example.com");

  await page.goto("/admin");
  await page.getByLabel("Email or user ID").fill("nobody@example.com");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page.getByText("No user matches")).toBeVisible();

  await page.getByLabel("Email or user ID").fill(targetEmail.toUpperCase());
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page).toHaveURL(`/admin/users/${targetId}`);
  await expect(page.getByTestId("admin-balance")).toHaveText("10");
  await expect(page.getByTestId("ledger-check")).toContainText("matches");

  await page.getByLabel("Amount").fill("5");
  await page.getByLabel("Reason").fill("e2e goodwill");
  await page.getByRole("button", { name: "Apply adjustment" }).click();
  await expect(page.getByRole("status")).toContainText("New balance: 15");
  await expect(page.getByTestId("admin-balance")).toHaveText("15");
  await expect(page.getByTestId("transaction-row").first()).toContainText(
    "[by e2e-admin] e2e goodwill",
  );

  await page.getByLabel("Amount").fill("-100");
  await page.getByLabel("Reason").fill("e2e too much");
  await page.getByRole("button", { name: "Apply adjustment" }).click();
  await expect(page.getByText("balance is too low")).toBeVisible();
  await expect(page.getByTestId("admin-balance")).toHaveText("15");
});
