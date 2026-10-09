import { expect, test } from "@playwright/test";

const origin = "http://localhost:3100";

test("pages have a localized title, description and Open Graph image", async ({
  page,
  context,
}) => {
  await page.goto("/terms");
  await expect(page).toHaveTitle("Terms of Service · Acme");
  await page.goto("/");
  await expect(page).toHaveTitle("Acme: Pay-as-you-go AI tool");
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    "content",
    "Acme is an AI tool you pay for with credits. Start with 10 free credits, then buy a pack or subscribe monthly. Credits never expire.",
  );
  const ogImage = page.locator('meta[property="og:image"]');
  await expect(ogImage).toHaveAttribute(
    "content",
    new RegExp(`^${origin}/opengraph-image`),
  );

  const image = await page.request.get(
    (await ogImage.getAttribute("content"))!,
  );
  expect(image.status()).toBe(200);
  expect(image.headers()["content-type"]).toBe("image/png");

  await context.addCookies([{ name: "NEXT_LOCALE", value: "zh", url: origin }]);
  await page.reload();
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    "content",
    "Acme 是按积分付费的 AI 工具。注册即送 10 积分，之后可以购买积分包或按月订阅。积分永不过期。",
  );
  await page.goto("/privacy");
  await expect(page).toHaveTitle("隐私政策 · Acme");
});

test("legal pages have their own description", async ({ page }) => {
  const descriptions = new Set<string | null>();
  for (const path of ["/", "/terms", "/privacy", "/refund-policy"]) {
    await page.goto(path);
    descriptions.add(
      await page.locator('meta[name="description"]').getAttribute("content"),
    );
  }
  expect(descriptions.size).toBe(4);
  await page.goto("/refund-policy");
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    "content",
    /14 days/,
  );
});

test("public pages declare their own URL as canonical", async ({ page }) => {
  for (const path of [
    "/",
    "/pricing",
    "/terms",
    "/privacy",
    "/refund-policy",
  ]) {
    // Query strings (outreach refs) must not create duplicate URLs.
    await page.goto(`${path}?ref=test`);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      path === "/" ? origin : `${origin}${path}`,
    );
  }
});

test("pricing page has its own description with live prices", async ({
  page,
}) => {
  await page.goto("/pricing");
  const description =
    "Pay per use from $5.90 for the Single pack, as low as $0.29 per run in a pack, or subscribe for $9.90 a month. Credits never expire.";
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    "content",
    description,
  );
  await expect(page.locator('meta[property="og:description"]')).toHaveAttribute(
    "content",
    description,
  );
  await expect(page.locator('meta[property="og:url"]')).toHaveAttribute(
    "content",
    `${origin}/pricing`,
  );
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    "content",
    new RegExp(`^${origin}/opengraph-image`),
  );
});

test("home page describes the site and product as JSON-LD", async ({
  page,
}) => {
  await page.goto("/");
  const json = await page
    .locator('script[type="application/ld+json"]')
    .textContent();
  const graph: Record<string, unknown>[] = JSON.parse(json!)["@graph"];
  const byType = (type: string) => graph.find((node) => node["@type"] === type);
  expect(byType("WebSite")).toMatchObject({
    name: "Acme",
    url: `${origin}/`,
  });
  expect(byType("Organization")).toMatchObject({
    name: "Acme",
    url: `${origin}/`,
    logo: `${origin}/apple-icon.png`,
  });
  expect(byType("SoftwareApplication")).toMatchObject({
    name: "Acme",
    operatingSystem: "Web",
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: "USD",
      lowPrice: "5.90",
      highPrice: "79.90",
      offerCount: 4,
    },
  });
  // Ratings would not be visible on the page, so they must not be claimed.
  expect(json).not.toContain("aggregateRating");
});

test("login and signup pages are not indexed", async ({ page }) => {
  for (const path of ["/sign-in", "/sign-up"]) {
    await page.goto(path);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      /noindex/,
    );
  }
});

test("robots.txt keeps crawlers out of the app and points to the sitemap", async ({
  request,
}) => {
  const body = await (await request.get("/robots.txt")).text();
  expect(body).toContain("Allow: /");
  expect(body).toContain("Disallow: /dashboard");
  expect(body).toContain("Disallow: /api");
  expect(body).toContain(`Sitemap: ${origin}/sitemap.xml`);
});

test("sitemap.xml lists the public pages", async ({ request }) => {
  const body = await (await request.get("/sitemap.xml")).text();
  for (const path of [
    "/",
    "/pricing",
    "/blog",
    "/blog/getting-started",
    "/blog/how-credits-work",
    "/terms",
    "/privacy",
    "/refund-policy",
  ])
    expect(body).toContain(`<loc>${origin}${path}</loc>`);
  expect(body).not.toContain("/dashboard");
});

test("sitemap.xml gives blog URLs the post's updated date", async ({
  request,
}) => {
  const body = await (await request.get("/sitemap.xml")).text();
  const entry = (path: string) =>
    new RegExp(
      `<loc>${origin}${path}</loc>\\s*(<lastmod>([^<]+)</lastmod>)?`,
    ).exec(body);
  expect(entry("/blog/getting-started")?.[2]).toMatch(/^\d{4}-\d{2}-\d{2}/);
  expect(entry("/blog")?.[2]).toMatch(/^\d{4}-\d{2}-\d{2}/);
  // Other pages have no reliable date, and a wrong lastmod is worse than none.
  expect(entry("/pricing")?.[1]).toBeUndefined();
});

test("llms.txt summarizes the product with production links", async ({
  request,
}) => {
  const response = await request.get("/llms.txt");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("text/plain");
  const body = await response.text();
  expect(body).toMatch(/^# Acme\n\n> /);
  for (const path of [
    "/",
    "/pricing",
    "/blog",
    "/blog/getting-started",
    "/blog/how-credits-work",
    "/terms",
    "/privacy",
    "/refund-policy",
  ])
    expect(body).toContain(`](https://example.com${path})`);
  expect(body).not.toContain(origin);
  expect(body).not.toMatch(/<\/?\w+>|DRAFT|\/dashboard/);
});

test("pages link the favicon, SVG icon and Apple touch icon", async ({
  page,
}) => {
  await page.goto("/");
  for (const [selector, type] of [
    ['link[rel="icon"][href^="/favicon.ico"]', "image/x-icon"],
    ['link[rel="icon"][type="image/svg+xml"]', "image/svg+xml"],
    ['link[rel="apple-touch-icon"]', "image/png"],
  ]) {
    const href = await page.locator(selector).getAttribute("href");
    const response = await page.request.get(href!);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain(type);
  }
});
