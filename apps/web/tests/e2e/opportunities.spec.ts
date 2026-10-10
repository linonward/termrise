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
  // Star the first one; the starred filter shows only it.
  const saved = page.waitForResponse(
    (r) => r.url().endsWith("/star") && r.request().method() === "PUT",
  );
  await page.getByTestId("star-button").first().click();
  expect((await saved).ok()).toBe(true);
  await expect(page.getByTestId("star-button").first()).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("link", { name: "Starred only" }).click();
  await expect(page.getByTestId("opportunity-row")).toHaveCount(1);
  await page.getByRole("link", { name: "All opportunities" }).click();
  await expect(page.getByTestId("opportunity-row")).toHaveCount(2);

  // Compare both, side by side.
  for (const box of await page
    .getByRole("checkbox", { name: /to compare$/ })
    .all())
    await box.check();
  await page.getByRole("button", { name: "Compare selected" }).click();
  await expect(page).toHaveURL(/\/opportunities\/compare\?id=/);
  await expect(
    page.getByRole("columnheader", { name: "meeting notes" }),
  ).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "invoice tool" }),
  ).toBeVisible();
  await expect(
    page.getByRole("rowheader", { name: "Monthly searches" }),
  ).toBeVisible();
  await expect(page.getByTestId("compare-row")).toHaveCount(20);
  const compareUrl = page.url();
  await page.goBack();
  await expect(page.getByTestId("opportunity-row")).toHaveCount(2);

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

  // Another user does not see it, nor can compare it.
  const other = await browser.newContext();
  await signIn(other);
  const otherPage = await other.newPage();
  const response = await otherPage.goto(page.url());
  expect(response?.status()).toBe(404);
  await otherPage.goto(compareUrl);
  await expect(
    otherPage.getByText("Select 2 to 4 of your opportunities"),
  ).toBeVisible();
  await other.close();
});

test("opportunity pages need a session", async ({ page }) => {
  await page.goto("/opportunities");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fopportunities$/);
});

test("decides with a reason after planning and running an experiment", async ({
  page,
  context,
}) => {
  await signIn(context);
  await page.goto("/research");
  await page.getByLabel("Name").fill("Decision project");
  await page.getByLabel("Seed terms").fill("meeting notes");
  await page.getByRole("button", { name: "Create project" }).click();
  await page.getByRole("button", { name: "Run research" }).click();
  await page.getByRole("link", { name: "View opportunities" }).click();
  await page
    .getByTestId("opportunity-row")
    .first()
    .getByRole("link")
    .first()
    .click();
  await expect(page).toHaveURL(/\/opportunities\/[0-9a-f-]{36}$/);

  // Go needs validation first: it is not offered yet.
  await expect(page.getByLabel("Go: build it")).toHaveCount(0);
  await page.getByLabel("Validate first").check();
  await page.getByLabel("Reason").fill("Demand is there, test payment");
  await page.getByRole("button", { name: "Save decision" }).click();
  await expect(page.getByTestId("decision")).toHaveCount(1);
  await expect(page.getByTestId("decision")).toContainText(
    "Demand is there, test payment",
  );

  await page.getByText("Plan an experiment").click();
  await page.getByLabel("Type").selectOption("landing_smoke_test");
  await page.getByLabel("Hypothesis").fill("Reps pay for summaries");
  await page.getByLabel("Channel").fill("r/sales");
  await page.getByLabel("Event counted").fill("Paid pre-orders");
  await page.getByLabel("Success threshold").fill("3 pre-orders");
  await page.getByLabel("Stop condition").fill("None after 300 visitors");
  await page.getByRole("button", { name: "Add experiment" }).click();
  await expect(page.getByTestId("experiment")).toHaveCount(1);
  await expect(page.getByTestId("experiment-status")).toHaveText("Planned");

  await page.getByLabel("New status").selectOption("running");
  await page.getByRole("button", { name: "Update" }).click();
  await expect(page.getByTestId("experiment-status")).toHaveText("Running");

  await page.getByLabel("Go: build it").check();
  await page.getByLabel("Reason").fill("4 pre-orders in a week");
  await page.getByRole("button", { name: "Save decision" }).click();
  await expect(page.getByTestId("decision")).toHaveCount(2);
  await expect(page.getByTestId("decision").first()).toContainText("Go");
  await expect(page.getByLabel("Go: build it")).toHaveCount(0);

  // The brief includes the decision and the experiment, and downloads as Markdown.
  await page.getByText("Preview").click();
  const preview = page.getByTestId("brief-preview");
  await expect(preview).toContainText("# Product Brief: meeting notes");
  await expect(preview).toContainText("4 pre-orders in a week");
  await expect(preview).toContainText("Reps pay for summaries");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download Markdown" }).click();
  expect((await download).suggestedFilename()).toBe("brief-meeting-notes.md");
});

test("starts a product from a Go opportunity and records its results", async ({
  page,
  context,
}) => {
  await signIn(context);
  await page.goto("/research");
  await page.getByLabel("Name").fill("Product project");
  await page.getByLabel("Seed terms").fill("invoice tool");
  await page.getByRole("button", { name: "Create project" }).click();
  await page.getByRole("button", { name: "Run research" }).click();
  await page.getByRole("link", { name: "View opportunities" }).click();
  await page
    .getByTestId("opportunity-row")
    .first()
    .getByRole("link")
    .first()
    .click();
  for (const [label, reason] of [
    ["Validate first", "Test it"],
    ["Go: build it", "Pre-orders"],
  ]) {
    await page.getByLabel(label).check();
    await page.getByLabel("Reason").fill(reason);
    await page.getByRole("button", { name: "Save decision" }).click();
    await expect(page.getByTestId("decision").first()).toContainText(reason);
  }

  await page.getByRole("button", { name: "Start product" }).click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId("product-status")).toHaveText("Not started");

  // A launched product needs its launch date.
  await page.getByLabel("Status").selectOption("launched");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await page.getByLabel("Launch date", { exact: true }).fill("2026-10-12");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByTestId("product-status")).toHaveText("Launched");

  await page.getByText("Record visitors or activations").first().click();
  await page.getByLabel("Count", { exact: true }).fill("300");
  await page.getByLabel("From", { exact: true }).fill("2026-10-12");
  await page.getByLabel("To", { exact: true }).fill("2026-10-18");
  await page
    .getByRole("button", { name: "Record visitors or activations" })
    .click();
  await expect(page.getByTestId("total-visitors")).toHaveText("300");

  await page.getByText("Record revenue").first().click();
  await page.getByLabel("Date", { exact: true }).fill("2026-10-15");
  await page.getByLabel("Orders", { exact: true }).fill("2");
  await page.getByLabel("Gross", { exact: true }).fill("18");
  await page.getByRole("button", { name: "Record revenue" }).click();
  const total = page.getByTestId("revenue-total");
  await expect(total).toContainText("USD");
  await expect(total).toContainText("$18.00");
  // Fees were left empty: net stays unknown, and the order is manual.
  await expect(total).toContainText("Unknown");
  await expect(page.getByTestId("revenue-row")).toContainText("Manual");

  await page.goto("/projects");
  await expect(page.getByTestId("product-row")).toHaveCount(1);
});
