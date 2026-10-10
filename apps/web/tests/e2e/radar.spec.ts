import { expect, test } from "@playwright/test";

import { closeTestDb, testDb } from "@repo/db/testing/db";
import { createFakeHackerNews } from "@repo/research/adapters/fake-hacker-news";
import { createRadar } from "@repo/research/radar";

import { signIn } from "../setup/sign-in";

test.afterAll(closeTestDb);

// The worker's collection, with a fake source: E2E never calls Hacker News.
async function collect(id: number, title: string) {
  await createRadar({
    database: testDb(),
    hackerNews: createFakeHackerNews({
      lists: { top: [id], show: [id] },
      items: [
        {
          id,
          type: "story",
          title,
          url: `https://example.com/${id}`,
          time: 1_760_000_000,
          score: 42,
          descendants: 7,
        },
      ],
    }),
  }).collectHackerNews();
}

test("starts research from a radar story", async ({ page, context }) => {
  const id = Date.now();
  const term = `radar term ${id}`;
  await collect(id, `Show HN: Radar term ${id}`);
  await signIn(context);

  await page.goto("/radar");
  await expect(page.getByTestId("discussion-notice")).toBeVisible();
  await page.getByLabel("Search terms").fill(term);
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page).toHaveURL(/q=radar\+term/);
  await expect(page.getByTestId("radar-row")).toHaveCount(1);
  // One collection is not enough to measure growth.
  await expect(page.getByTestId("lifecycle")).toHaveText("Not enough data");
  await page.getByRole("link", { name: `Show HN: Radar term ${id}` }).click();

  await expect(page).toHaveURL(/\/radar\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId("observation-row")).toHaveCount(2);
  await expect(page.getByTestId("lifecycle-help")).toContainText(
    "Not enough observations",
  );
  await expect(page.getByRole("link", { name: "Discussion" })).toHaveAttribute(
    "href",
    `https://news.ycombinator.com/item?id=${id}`,
  );
  // Star it, then find it with the starred filter. The button shows the star at once;
  // wait until the save has finished.
  const saved = page.waitForResponse(
    (r) => r.url().endsWith("/star") && r.request().method() === "PUT",
  );
  await page
    .getByRole("button", { name: `Star Show HN: Radar term ${id}` })
    .click();
  expect((await saved).ok()).toBe(true);
  await page.goto("/radar?starred=1");
  await expect(page.getByTestId("radar-row")).toHaveCount(1);
  await page.getByRole("link", { name: `Show HN: Radar term ${id}` }).click();
  await page.getByRole("link", { name: "Start research" }).click();

  await expect(page).toHaveURL(/\/research\?/);
  await expect(page.getByLabel("Seed terms")).toHaveValue(term);
  await expect(page.getByLabel("Name")).toHaveValue(
    `Show HN: Radar term ${id}`,
  );
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page).toHaveURL(/\/research\/[0-9a-f-]{36}$/);
});

test("shows a Google Trends search with its approximate searches", async ({
  page,
  context,
}) => {
  const term = `trends term ${Date.now()}`;
  await createRadar({
    database: testDb(),
    googleTrends: {
      trending: async () => [
        {
          term,
          approxTraffic: 500,
          publishedAt: new Date(),
          newsUrl: "https://news.example/story",
        },
      ],
    },
  }).collectGoogleTrends("US");
  await signIn(context);
  await page.goto(`/radar?q=${encodeURIComponent(term)}`);
  const row = page.getByTestId("radar-row");
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("Google Trends");
  await expect(row).toContainText("500+ searches");
  await row.getByRole("link", { name: term }).click();
  await expect(
    page.getByRole("link", { name: "Google Trends" }),
  ).toHaveAttribute("href", "https://trends.google.com/trending?geo=US");
  await expect(page.getByTestId("observation-row")).toContainText(
    "Trending Now",
  );
});

test("shows no match for an unknown term and 404 for an unknown item", async ({
  page,
  context,
}) => {
  await signIn(context);
  await page.goto("/radar?q=no-such-term-anywhere");
  await expect(page.getByText("No matching stories")).toBeVisible();
  const response = await page.goto(
    "/radar/00000000-0000-4000-8000-000000000000",
  );
  expect(response?.status()).toBe(404);
});

test("radar needs a session", async ({ page }) => {
  await page.goto("/radar");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fradar$/);
});
