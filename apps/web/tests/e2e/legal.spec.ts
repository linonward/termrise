import { expect, test } from "@playwright/test";

import product from "../../../../product.config";

const pages = [
  { path: "/terms", link: "Terms", en: "Terms of Service", zh: "服务条款" },
  { path: "/privacy", link: "Privacy", en: "Privacy Policy", zh: "隐私政策" },
  {
    path: "/refund-policy",
    link: "Refund Policy",
    en: "Refund Policy",
    zh: "退款政策",
  },
] as const;

// The refund rules cover purchases: hidden while the product does not charge.
test("/refund-policy is not found and not linked while billing is disabled", async ({
  page,
}) => {
  test.skip(product.billingEnabled, "billing is enabled in product.config.ts");
  expect((await page.goto("/refund-policy"))?.status()).toBe(404);
  await page.goto("/");
  await expect(
    page.getByRole("contentinfo").getByRole("link", { name: "Refund Policy" }),
  ).toHaveCount(0);
});

for (const { path, link, en, zh } of pages.filter(
  ({ path }) => product.billingEnabled || path !== "/refund-policy",
)) {
  test(`${path} opens from the footer in English and Chinese`, async ({
    page,
    context,
  }) => {
    await page.goto("/");
    await page
      .getByRole("contentinfo")
      .getByRole("link", { name: link, exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(
      page.getByRole("heading", { level: 1, name: en }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { level: 2 }).first()).toBeVisible();

    await context.addCookies([
      { name: "NEXT_LOCALE", value: "zh", url: page.url() },
    ]);
    await page.reload();
    await expect(
      page.getByRole("heading", { level: 1, name: zh }),
    ).toBeVisible();
  });
}

test("terms and refund policy cover subscriptions", async ({ page }) => {
  test.skip(
    !product.billingEnabled,
    "billing is disabled in product.config.ts",
  );
  await page.goto("/terms");
  await expect(page.getByRole("main")).toContainText(
    "A subscription renews automatically every month.",
  );
  await page.goto("/refund-policy");
  await expect(
    page.getByRole("heading", { level: 2, name: "Subscriptions" }),
  ).toBeVisible();
  await expect(page.getByRole("main")).toContainText(
    "A refund does not cancel the subscription.",
  );
});

test("terms list the prohibited content", async ({ page }) => {
  await page.goto("/terms");
  await expect(
    page.getByRole("heading", { level: 2, name: "Acceptable use" }),
  ).toBeVisible();
});

for (const path of ["/", "/blog", "/terms"]) {
  test(`${path} shows the support email in the footer`, async ({ page }) => {
    await page.goto(path);
    await expect(
      page
        .getByRole("contentinfo")
        .getByRole("link", { name: `Support: ${product.supportEmail}` }),
    ).toHaveAttribute("href", `mailto:${product.supportEmail}`);
  });
}

// The root layout sends only client namespaces to the browser (src/i18n/client-messages.ts).
test("pages without legal text do not ship it to the browser", async ({
  request,
}) => {
  const sentence = "These Terms govern your use of Termrise";
  expect(await (await request.get("/terms")).text()).toContain(sentence);
  for (const path of ["/sign-in", "/blog"])
    expect(await (await request.get(path)).text(), path).not.toContain(
      sentence,
    );
});
