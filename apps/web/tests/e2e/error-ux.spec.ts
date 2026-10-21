import { expect, test } from "@playwright/test";

import { closeTestDb } from "@repo/db/testing/db";

import product from "../../../../product.config";
import { signIn } from "../setup/sign-in";

test.afterAll(closeTestDb);
// Billing UI is hidden while the product does not charge (product.config.ts billingEnabled);
// the billing API keeps its integration tests in apps/api.
test.skip(!product.billingEnabled, "billing is disabled in product.config.ts");

// apps/api serves checkout.
const CHECKOUT = "**/api/checkout";

test("checkout errors show a localized message for each failure kind", async ({
  page,
  context,
}) => {
  await signIn(context);
  await page.goto("/pricing");
  const buy = page.getByRole("button", { name: "购买 Starter" });
  const alert = page.getByTestId("pack-starter").getByRole("alert");

  await page.route(CHECKOUT, (route) =>
    route.fulfill({
      status: 502,
      json: { error: { code: "PAYMENT_ERROR", message: "x" } },
    }),
  );
  await buy.click();
  await expect(alert).toHaveText("支付暂时不可用，请几分钟后重试。");

  await page.unroute(CHECKOUT);
  await page.route(CHECKOUT, (route) =>
    route.fulfill({ status: 500, body: "Internal Server Error" }),
  );
  await buy.click();
  await expect(alert).toHaveText("服务器出错了，请重试。");

  await page.unroute(CHECKOUT);
  await page.route(CHECKOUT, (route) => route.abort());
  await buy.click();
  await expect(alert).toHaveText("无法连接服务器，请检查网络后重试。");
});
