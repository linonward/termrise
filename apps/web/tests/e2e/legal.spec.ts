import { expect, test } from "@playwright/test";

import product from "../../../../product.config";

const pages = [
  { path: "/terms", link: "服务条款" },
  { path: "/privacy", link: "隐私政策" },
  { path: "/refund-policy", link: "退款政策" },
] as const;

// The refund rules cover purchases: hidden while the product does not charge.
test("/refund-policy is not found and not linked while billing is disabled", async ({
  page,
}) => {
  test.skip(product.billingEnabled, "billing is enabled in product.config.ts");
  expect((await page.goto("/refund-policy"))?.status()).toBe(404);
  await page.goto("/");
  await expect(
    page.getByRole("contentinfo").getByRole("link", { name: "退款政策" }),
  ).toHaveCount(0);
});

for (const { path, link } of pages.filter(
  ({ path }) => product.billingEnabled || path !== "/refund-policy",
)) {
  test(`${path} opens from the footer`, async ({ page }) => {
    await page.goto("/");
    await page
      .getByRole("contentinfo")
      .getByRole("link", { name: link, exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(
      page.getByRole("heading", { level: 1, name: link }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { level: 2 }).first()).toBeVisible();
  });
}

test("terms and refund policy cover subscriptions", async ({ page }) => {
  test.skip(
    !product.billingEnabled,
    "billing is disabled in product.config.ts",
  );
  await page.goto("/terms");
  await expect(page.getByRole("main")).toContainText("订阅每月自动续费。");
  await page.goto("/refund-policy");
  await expect(
    page.getByRole("heading", { level: 2, name: "订阅" }),
  ).toBeVisible();
  await expect(page.getByRole("main")).toContainText("退款不会取消订阅");
});

test("terms list the prohibited content", async ({ page }) => {
  await page.goto("/terms");
  await expect(
    page.getByRole("heading", { level: 2, name: "使用规范" }),
  ).toBeVisible();
});

for (const path of ["/", "/blog", "/terms"]) {
  test(`${path} shows the support email in the footer`, async ({ page }) => {
    await page.goto(path);
    await expect(
      page
        .getByRole("contentinfo")
        .getByRole("link", { name: `客服：${product.supportEmail}` }),
    ).toHaveAttribute("href", `mailto:${product.supportEmail}`);
  });
}

// The root layout sends only client namespaces to the browser (src/i18n/client-messages.ts).
test("pages without legal text do not ship it to the browser", async ({
  request,
}) => {
  const sentence = "本条款适用于你对 Termrise";
  expect(await (await request.get("/terms")).text()).toContain(sentence);
  for (const path of ["/sign-in", "/blog"])
    expect(await (await request.get(path)).text(), path).not.toContain(
      sentence,
    );
});
