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
  const buy = page.getByRole("button", { name: "Buy Starter" });
  const alert = page.getByTestId("pack-starter").getByRole("alert");

  await page.route(CHECKOUT, (route) =>
    route.fulfill({
      status: 502,
      json: { error: { code: "PAYMENT_ERROR", message: "x" } },
    }),
  );
  await buy.click();
  await expect(alert).toHaveText(
    "Checkout is unavailable right now. Try again in a few minutes.",
  );

  await page.unroute(CHECKOUT);
  await page.route(CHECKOUT, (route) =>
    route.fulfill({ status: 500, body: "Internal Server Error" }),
  );
  await buy.click();
  await expect(alert).toHaveText(
    "Something went wrong on our side. Try again.",
  );

  await page.unroute(CHECKOUT);
  await page.route(CHECKOUT, (route) => route.abort());
  await buy.click();
  await expect(alert).toHaveText(
    "Can't reach the server. Check your connection and try again.",
  );

  await context.addCookies([
    { name: "NEXT_LOCALE", value: "zh", domain: "localhost", path: "/" },
  ]);
  await page.reload();
  await page.getByRole("button", { name: "购买 Starter" }).click();
  await expect(page.getByTestId("pack-starter").getByRole("alert")).toHaveText(
    "无法连接服务器，请检查网络后重试。",
  );
});
