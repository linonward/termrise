import { expect, test } from "@playwright/test";

import { closeTestDb } from "@repo/db/testing/db";

import { signIn } from "../setup/sign-in";

const origin = "http://localhost:3100";
const post = "/blog/getting-started";

test.afterAll(closeTestDb);

test("blog index lists the posts with their own metadata", async ({ page }) => {
  await page.goto("/blog?ref=test");
  await expect(page).toHaveTitle("Termrise 博客 · Termrise");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    `${origin}/blog`,
  );
  await expect(
    page.getByRole("heading", { level: 1, name: "使用指南和更新。" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Termrise 入门" }).click();
  await expect(page).toHaveURL(new RegExp(`${post}$`));
});

test("blog post has its own metadata, sections, structured data and CTA", async ({
  page,
}) => {
  await page.goto(post);
  await expect(page).toHaveTitle("Termrise 入门 · Termrise");
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    "content",
    "创建账号，了解 Termrise 如何把上升搜索词变成产品机会。",
  );
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    `${origin}${post}`,
  );
  await expect(page.locator('meta[property="og:type"]')).toHaveAttribute(
    "content",
    "article",
  );
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    "content",
    new RegExp(`^${origin}/opengraph-image`),
  );
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Termrise 入门",
    }),
  ).toBeVisible();
  for (const name of ["创建账号", "研究项目的步骤", "需要知道的事"])
    await expect(page.getByRole("heading", { level: 2, name })).toBeVisible();

  const json = await page
    .locator('script[type="application/ld+json"]')
    .textContent();
  const graph: Record<string, unknown>[] = JSON.parse(json!)["@graph"];
  expect(graph.find((node) => node["@type"] === "BlogPosting")).toMatchObject({
    headline: "Termrise 入门",
    datePublished: "2026-10-10",
    dateModified: "2026-10-10",
    mainEntityOfPage: `${origin}${post}`,
    publisher: { "@type": "Organization", name: "Termrise" },
  });
  expect(
    graph.find((node) => node["@type"] === "BreadcrumbList"),
  ).toMatchObject({
    itemListElement: [
      { position: 1, name: "博客", item: `${origin}/blog` },
      {
        position: 2,
        name: "Termrise 入门",
        item: `${origin}${post}`,
      },
    ],
  });

  await page
    .getByRole("navigation", { name: "面包屑导航" })
    .getByRole("link", { name: "博客" })
    .click();
  await expect(page).toHaveURL(/\/blog$/);
  await page.goBack();
  await page
    .getByRole("main")
    .getByRole("link", { name: "免费开始" })
    .last()
    .click();
  await expect(page).toHaveURL(/\/sign-up$/);
});

test("signed-in readers go straight to the dashboard", async ({
  page,
  context,
}) => {
  await signIn(context);
  await page.goto(post);
  await page
    .getByRole("main")
    .getByRole("link", { name: "免费开始" })
    .last()
    .click();
  await expect(page).toHaveURL(/\/today$/);
});

test("each blog post links to its conversion page from the body", async ({
  page,
}) => {
  for (const [path, name, href] of [[post, "从这里开始", "/"]]) {
    await page.goto(path);
    const link = page
      .getByRole("article")
      .getByRole("link", { name, exact: true });
    await expect(link, path).toHaveAttribute("href", href);
    await expect(link, path).toBeVisible();
  }
});

// The only post has no related posts yet: no empty "继续阅读" section.
test("a blog post without related posts has no Keep reading section", async ({
  page,
}) => {
  await page.goto(post);
  await expect(page.getByRole("region", { name: "继续阅读" })).toHaveCount(0);
});

test("unknown blog slugs are not found", async ({ request }) => {
  const response = await request.get("/blog/not-a-post");
  expect(response.status()).toBe(404);
});

test("the footer links to the blog", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("contentinfo")
    .getByRole("link", { name: "博客" })
    .click();
  await expect(page).toHaveURL(/\/blog$/);
});
