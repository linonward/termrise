import { expect, test } from "@playwright/test";

import { closeTestDb } from "@repo/db/testing/db";

import { signIn } from "../setup/sign-in";

test.afterAll(closeTestDb);

test("creates, edits and deletes a draft research project", async ({
  page,
  context,
}) => {
  await signIn(context);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/research");
  await expect(page).toHaveTitle("Research · Termrise");
  await expect(page.getByText("No research projects yet")).toBeVisible();
  await expect(page.getByText("United States · English")).toBeVisible();

  await page.getByLabel("Name").fill("AI meeting notes");
  await page
    .getByLabel("Seed terms")
    .fill("AI Meeting Notes\nai meeting notes\n sales call summary ");
  await page.getByRole("button", { name: "Create project" }).click();

  await expect(page).toHaveURL(/\/research\/[0-9a-f-]{36}$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "AI meeting notes" }),
  ).toBeVisible();
  await expect(
    page.getByRole("main").getByText("Draft", { exact: true }),
  ).toBeVisible();
  // Seeds are normalized and de-duplicated by the API.
  await expect(page.getByLabel("Seed terms")).toHaveValue(
    "ai meeting notes\nsales call summary",
  );
  await expect(page.getByText("$20.00")).toBeVisible();

  await page.getByLabel("Data budget (USD)").fill("7.5");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("status")).toHaveText("Changes saved.");
  await expect(page.getByText("$7.50")).toBeVisible();

  await page.getByRole("link", { name: "Research" }).first().click();
  await expect(page.getByTestId("research-project-row")).toHaveCount(1);
  await page.getByRole("link", { name: "AI meeting notes" }).click();

  await page.getByRole("button", { name: "Delete project" }).click();
  await page.getByRole("button", { name: "Yes, delete" }).click();
  await expect(page).toHaveURL(/\/research$/);
  await expect(page.getByText("No research projects yet")).toBeVisible();
  expect(errors).toEqual([]);
});

test("shows a validation error from the API", async ({ page, context }) => {
  await signIn(context);
  await page.goto("/research");
  await page.getByLabel("Name").fill("Empty seeds");
  // Only blank lines: the browser accepts it, the API rejects it.
  await page.getByLabel("Seed terms").fill(" \n ");
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    "Some of the information is invalid. Check it and try again.",
  );
});

test("another user's project is not found", async ({ page, browser }) => {
  const owner = await browser.newContext();
  await signIn(owner);
  const ownerPage = await owner.newPage();
  await ownerPage.goto("/research");
  await ownerPage.getByLabel("Name").fill("Private project");
  await ownerPage.getByLabel("Seed terms").fill("secret seed");
  await ownerPage.getByRole("button", { name: "Create project" }).click();
  await expect(ownerPage).toHaveURL(/\/research\/[0-9a-f-]{36}$/);
  const url = ownerPage.url();
  await owner.close();

  await signIn(page.context());
  const response = await page.goto(url);
  expect(response?.status()).toBe(404);
});

test("research pages need a session", async ({ page }) => {
  await page.goto("/research");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fresearch$/);
});

test("imports terms from a CSV into a draft", async ({ page, context }) => {
  await signIn(context);
  await page.goto("/research");
  await page.getByLabel("Name").fill("Imported project");
  await page.getByLabel("Seed terms").fill("first seed");
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page).toHaveURL(/\/research\/[0-9a-f-]{36}$/);
  await expect(
    page.getByText("No signals yet.", { exact: false }),
  ).toBeVisible();

  const file = {
    name: "terms.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "term,url,observed_at,source\n" +
        "AI Note Taker,https://example.com/a,2026-10-01,Trends export\n" +
        "first seed,,,\n" +
        "broken,ftp://example.com,,\n",
    ),
  };
  await page.getByLabel("CSV file").setInputFiles(file);
  await page.getByRole("button", { name: "Import" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Imported 2 terms, 0 duplicates, 1 row skipped. 1 new seed term.",
  );
  await expect(page.getByRole("status")).toContainText(
    "Line 4: url is not an http(s) link",
  );
  await expect(page.getByTestId("signal-row")).toHaveCount(2);
  await expect(page.getByRole("cell", { name: "Trends export" })).toBeVisible();
  await expect(page.getByLabel("Seed terms")).toHaveValue(
    "first seed\nai note taker",
  );

  // The same file again: every row is a duplicate.
  await page.getByLabel("CSV file").setInputFiles(file);
  await page.getByRole("button", { name: "Import" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Imported 0 terms, 2 duplicates",
  );
  await expect(page.getByTestId("signal-row")).toHaveCount(2);
});
