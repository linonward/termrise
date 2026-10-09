import { expect, test } from "@playwright/test";

import { closeTestDb } from "@repo/db/testing/db";

import { signIn } from "../setup/sign-in";

const origin = "http://localhost:3100";
const post = "/blog/getting-started";

test.afterAll(closeTestDb);

test("blog index lists the posts with their own metadata", async ({ page }) => {
  await page.goto("/blog?ref=test");
  await expect(page).toHaveTitle("Acme Blog · Acme");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    `${origin}/blog`,
  );
  await expect(
    page.getByRole("heading", { level: 1, name: "Guides and updates." }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Getting started with Acme" }).click();
  await expect(page).toHaveURL(new RegExp(`${post}$`));
});

test("blog post has its own metadata, sections, structured data and CTA", async ({
  page,
}) => {
  await page.goto(post);
  await expect(page).toHaveTitle("Getting Started with Acme · Acme");
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    "content",
    "Create an account, run your first task and check your credits.",
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
    page.getByRole("heading", { level: 1, name: "Getting started with Acme" }),
  ).toBeVisible();
  for (const name of [
    "Create an account",
    "Run your first task",
    "What to read next",
  ])
    await expect(page.getByRole("heading", { level: 2, name })).toBeVisible();

  const json = await page
    .locator('script[type="application/ld+json"]')
    .textContent();
  const graph: Record<string, unknown>[] = JSON.parse(json!)["@graph"];
  expect(graph.find((node) => node["@type"] === "BlogPosting")).toMatchObject({
    headline: "Getting started with Acme",
    datePublished: "2026-01-01",
    dateModified: "2026-01-01",
    mainEntityOfPage: `${origin}${post}`,
    publisher: { "@type": "Organization", name: "Acme" },
  });
  expect(
    graph.find((node) => node["@type"] === "BreadcrumbList"),
  ).toMatchObject({
    itemListElement: [
      { position: 1, name: "Blog", item: `${origin}/blog` },
      {
        position: 2,
        name: "Getting started with Acme",
        item: `${origin}${post}`,
      },
    ],
  });

  await page
    .getByRole("navigation", { name: "Breadcrumb" })
    .getByRole("link", { name: "Blog" })
    .click();
  await expect(page).toHaveURL(/\/blog$/);
  await page.goBack();
  await page
    .getByRole("main")
    .getByRole("link", { name: "Get started free" })
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
    .getByRole("link", { name: "Get started free" })
    .last()
    .click();
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("each blog post links to its conversion page from the body", async ({
  page,
}) => {
  for (const [path, name, href] of [
    [post, "Start here", "/"],
    ["/blog/how-credits-work", "pricing page", "/pricing"],
  ]) {
    await page.goto(path);
    const link = page
      .getByRole("article")
      .getByRole("link", { name, exact: true });
    await expect(link, path).toHaveAttribute("href", href);
    await expect(link, path).toBeVisible();
  }
});

test("a blog post ends with related posts", async ({ page }) => {
  await page.goto(post);
  const related = page.getByRole("region", { name: "Keep reading" });
  const link = related.getByRole("link", {
    name: "How credits work",
    exact: true,
  });
  await expect(link).toHaveAttribute("href", "/blog/how-credits-work");
  await link.click();
  await expect(page).toHaveURL(/\/blog\/how-credits-work$/);
});

test("unknown blog slugs are not found", async ({ request }) => {
  const response = await request.get("/blog/not-a-post");
  expect(response.status()).toBe(404);
});

test("the footer links to the blog", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("contentinfo")
    .getByRole("link", { name: "Blog" })
    .click();
  await expect(page).toHaveURL(/\/blog$/);
});
