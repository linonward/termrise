import { expect, test } from "@playwright/test";

import { closeTestDb, testDb } from "@repo/db/testing/db";
import { createFakeHackerNews } from "@repo/research/adapters/fake-hacker-news";
import { createRadar } from "@repo/research/radar";

import { signIn } from "../setup/sign-in";

test.afterAll(closeTestDb);

// Desktop and mobile run at once: a millisecond alone can repeat between them.
const uniqueId = () => Date.now() * 1000 + Math.floor(Math.random() * 1000);

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
  const id = uniqueId();
  const term = `radar term ${id}`;
  await collect(id, `Show HN: Radar term ${id}`);
  await signIn(context);

  await page.goto("/radar");
  await expect(page.getByTestId("discussion-notice")).toBeVisible();
  await page.getByLabel("搜索词").fill(term);
  await page.getByRole("button", { name: "应用" }).click();
  await expect(page).toHaveURL(/q=radar\+term/);
  await expect(page.getByTestId("radar-row")).toHaveCount(1);
  // One collection is not enough to measure growth.
  await expect(page.getByTestId("lifecycle")).toHaveText("数据不足");
  await page.getByRole("link", { name: `Show HN: Radar term ${id}` }).click();

  await expect(page).toHaveURL(/\/radar\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId("observation-row")).toHaveCount(2);
  await expect(page.getByTestId("lifecycle-help")).toContainText("观测不够");
  await expect(page.getByRole("link", { name: "讨论" })).toHaveAttribute(
    "href",
    `https://news.ycombinator.com/item?id=${id}`,
  );
  // Star it, then find it with the starred filter. The button shows the star at once;
  // wait until the save has finished.
  const saved = page.waitForResponse(
    (r) => r.url().endsWith("/star") && r.request().method() === "PUT",
  );
  await page
    .getByRole("button", { name: `收藏 Show HN: Radar term ${id}` })
    .click();
  expect((await saved).ok()).toBe(true);
  await page.goto("/radar?starred=1");
  await expect(page.getByTestId("radar-row")).toHaveCount(1);
  await page.getByRole("link", { name: `Show HN: Radar term ${id}` }).click();
  await page.getByRole("link", { name: "开始研究" }).click();

  await expect(page).toHaveURL(/\/research\?/);
  await expect(page.locator('textarea[name="seeds"]')).toHaveValue(term);
  await expect(page.getByLabel("名称")).toHaveValue(
    `Show HN: Radar term ${id}`,
  );
  await page.getByRole("button", { name: "创建项目" }).click();
  await expect(page).toHaveURL(/\/research\/[0-9a-f-]{36}$/);
  // One collection on one day: one signal, from Hacker News.
  await expect(page.getByTestId("signal-row")).toHaveCount(1);
  await expect(page.getByTestId("signal-row")).toContainText("Hacker News");
});

test("turns a story title into short seeds before research", async ({
  page,
  context,
}) => {
  const id = uniqueId();
  await collect(
    id,
    `Show HN: Dovepass${id} – check a drone flight path in the browser`,
  );
  await signIn(context);

  await page.goto(`/radar?q=dovepass${id}`);
  await page.getByTestId("radar-row").getByRole("link").first().click();
  await page.getByRole("link", { name: "开始研究" }).click();
  await page.getByRole("button", { name: "创建项目" }).click();
  await expect(page).toHaveURL(/\/research\/[0-9a-f-]{36}$/);

  // The worker (fake extractor) answers; the page polls until it has.
  const panel = page.getByTestId("seed-suggestions");
  await panel.getByRole("button", { name: "建议短种子词" }).click();
  const phrases = panel.getByLabel("建议的短语，每行一个");
  await expect(phrases).toHaveValue("check a drone\nin the browser");
  await expect(panel).toContainText("测试数据");
  await phrases.fill("drone flight path\nelectronic signature app");
  await panel.getByRole("button", { name: "用作种子词" }).click();

  await expect(page.locator('textarea[name="seeds"]')).toHaveValue(
    "drone flight path\nelectronic signature app",
  );
  await expect(panel).toHaveCount(0);

  // The run's analysis (fake analyst) marks the seed unrelated to the title.
  await page.getByRole("button", { name: "运行研究" }).click();
  await page.getByRole("link", { name: "查看机会" }).click();
  await page
    .getByRole("link", { name: "electronic signature app", exact: true })
    .click();
  await expect(page.getByTestId("off-topic")).toContainText(
    "electronic signature app",
  );

  // The owner says the seed is on topic: the score is computed again.
  const toggle = page.getByRole("button", {
    name: "把 electronic signature app 标为相关",
  });
  await expect(toggle).toHaveText(/跑题\s*AI/);
  await toggle.click();
  await expect(
    page.getByRole("button", {
      name: "把 electronic signature app 标为跑题",
    }),
  ).toHaveText(/相关\s*你/);
});

test("shows a Google Trends search with its approximate searches", async ({
  page,
  context,
}) => {
  const term = `trends term ${uniqueId()}`;
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
  await expect(row).toContainText("500+ 次搜索");
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
  await expect(page.getByText("没有匹配的故事")).toBeVisible();
  const response = await page.goto(
    "/radar/00000000-0000-4000-8000-000000000000",
  );
  expect(response?.status()).toBe(404);
});

test("radar needs a session", async ({ page }) => {
  await page.goto("/radar");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fradar$/);
});
