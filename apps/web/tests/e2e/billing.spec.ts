import { expect, test } from "@playwright/test";
import { eq } from "drizzle-orm";

import {
  createFakePaymentProvider,
  FAKE_CUSTOMER_PORTAL_URL,
} from "@repo/billing/adapters/fake";
import { createBillingService } from "@repo/billing/billing-service";
import { purchases, subscriptions } from "@repo/db/schema";
import { closeTestDb, testDb } from "@repo/db/testing/db";

import product from "../../../../product.config";
import { E2E_API_URL, e2eEnv } from "../setup/e2e-env";
import { signIn } from "../setup/sign-in";

test.afterAll(closeTestDb);
// Billing UI is hidden while the product does not charge (product.config.ts billingEnabled);
// the billing API keeps its integration tests in apps/api.
test.skip(!product.billingEnabled, "billing is disabled in product.config.ts");

test("signed-out visitors see the four packs and sign up before buying", async ({
  page,
}) => {
  await page.goto("/pricing");
  for (const [pack, price, perUse] of [
    ["single", "$5.90", "每次 $0.59"],
    ["starter", "$19.90", "每次 $0.40"],
    ["creator", "$49.90", "每次 $0.33"],
    ["pro", "$79.90", "每次 $0.29"],
  ]) {
    await expect(page.getByTestId(`pack-${pack}`)).toContainText(price);
    await expect(page.getByTestId(`pack-${pack}`)).toContainText(perUse);
  }
  // The saving is rounded down from the real per-use price against Single.
  await expect(page.getByTestId("pack-single")).not.toContainText("保存");
  for (const [pack, saving] of [
    ["starter", "省 32%"],
    ["creator", "省 43%"],
    ["pro", "省 51%"],
  ])
    await expect(page.getByTestId(`pack-${pack}`)).toContainText(saving);
  await expect(page.getByTestId("pack-creator")).toContainText("150 runs");
  await expect(
    page.getByRole("link", { name: "购买 Starter" }),
  ).toHaveAttribute("href", "/sign-up?next=%2Fpricing");
  const plan = page.getByTestId("plan-monthly");
  for (const text of [
    "$9.90",
    "每月",
    "60 credits every month",
    "60 runs",
    "每次 $0.17",
    "省 72%",
  ])
    await expect(plan).toContainText(text);
  await expect(
    page.getByRole("link", { name: "开始月度订阅" }),
  ).toHaveAttribute("href", "/sign-up?next=%2Fpricing");
});

test("a subscription checkout grants the plan credits once paid, and blocks a second one", async ({
  page,
  context,
}) => {
  const { userId } = await signIn(context);
  await page.goto("/pricing");
  await page.getByRole("button", { name: "开始月度订阅" }).click();
  await expect(page).toHaveURL("/billing?checkout=subscription");
  await expect(page.getByTestId("checkout-status")).toContainText("已收到付款");
  await expect(page.getByTestId("billing-balance")).toHaveText("10");

  const [sub] = await testDb()
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId));
  await createBillingService({
    database: testDb(),
    provider: createFakePaymentProvider(),
    successUrl: `${e2eEnv.APP_URL}/billing?checkout=success`,
    subscriptionSuccessUrl: `${e2eEnv.APP_URL}/billing?checkout=subscription`,
  }).handleWebhookEvent({
    type: "subscription.payment_succeeded",
    eventId: `e2e-sub-${sub.id}`,
    subscriptionId: sub.id,
    providerOrderId: `fake_sub_ord_${sub.id}`,
    providerPaymentId: `fake_pay_${sub.id}`,
    rawEventType: "subscription.payment_succeeded",
    payload: {},
  });
  await expect(page.getByTestId("checkout-status")).toContainText(
    "Credits 已到账",
  );
  await expect(page.getByTestId("billing-balance")).toHaveText("70");
  const activity = page.getByTestId("credit-activity-row");
  await expect(activity.first()).toContainText("月度订阅");
  await expect(activity.first()).toContainText("+60");

  await page.goto("/pricing");
  await page.getByRole("button", { name: "开始月度订阅" }).click();
  await expect(
    page.getByTestId("plan-monthly").getByRole("alert"),
  ).toContainText("你已经有订阅了");
  await expect(page).toHaveURL("/pricing");
});

test("checkout redirect grants nothing; the webhook grants the pack", async ({
  page,
  context,
}) => {
  const { userId } = await signIn(context);
  await page.goto("/pricing");
  await page.getByRole("button", { name: "购买 Creator" }).click();
  await expect(page).toHaveURL("/billing?checkout=success");
  await expect(page.getByTestId("checkout-status")).toContainText("已收到付款");
  await expect(page.getByTestId("billing-balance")).toHaveText("10");
  const activity = page.getByTestId("credit-activity-row");
  await expect(activity).toHaveCount(1);
  await expect(activity.first()).toContainText("新用户赠送");
  const row = page.getByTestId("purchase-row");
  await expect(row).toContainText("Creator");
  await expect(row).toContainText("$49.90");
  await expect(row).toContainText("待付款");

  const [purchase] = await testDb()
    .select()
    .from(purchases)
    .where(eq(purchases.userId, userId));
  await createBillingService({
    database: testDb(),
    provider: createFakePaymentProvider(),
    successUrl: `${e2eEnv.APP_URL}/billing?checkout=success`,
    subscriptionSuccessUrl: `${e2eEnv.APP_URL}/billing?checkout=subscription`,
  }).handleWebhookEvent({
    type: "payment.succeeded",
    eventId: `e2e-${purchase.id}`,
    purchaseId: purchase.id,
    providerOrderId: `fake_ord_${purchase.id}`,
    rawEventType: "payment.succeeded",
    payload: {},
  });
  await expect(page.getByTestId("checkout-status")).toContainText(
    "Credits 已到账",
  );
  await expect(page.getByTestId("billing-balance")).toHaveText("160");
  await expect(row).toContainText("已付款");
  await expect(activity).toHaveCount(2);
  await expect(activity.first()).toContainText("Creator 套餐");
  await expect(activity.first()).toContainText("+150");
  await expect(activity.first()).toContainText("160");
  // A reload after the credits arrived does not show the banner again.
  await expect(page).toHaveURL("/billing");
  await page.reload();
  await expect(row).toContainText("已付款");
  await expect(page.getByTestId("checkout-status")).toHaveCount(0);
});

test("checkout status is hidden when the newest purchase was refunded", async ({
  page,
  context,
}) => {
  const { userId } = await signIn(context);
  await page.goto("/pricing");
  await page.getByRole("button", { name: "购买 Single" }).click();
  await expect(page).toHaveURL("/billing?checkout=success");
  const [purchase] = await testDb()
    .select()
    .from(purchases)
    .where(eq(purchases.userId, userId));
  const service = createBillingService({
    database: testDb(),
    provider: createFakePaymentProvider(),
    successUrl: `${e2eEnv.APP_URL}/billing?checkout=success`,
    subscriptionSuccessUrl: `${e2eEnv.APP_URL}/billing?checkout=subscription`,
  });
  const order = {
    purchaseId: purchase.id,
    providerOrderId: `fake_ord_${purchase.id}`,
    payload: {},
  };
  await service.handleWebhookEvent({
    ...order,
    type: "payment.succeeded",
    eventId: `e2e-paid-${purchase.id}`,
    rawEventType: "payment.succeeded",
  });
  await service.handleWebhookEvent({
    ...order,
    type: "payment.refunded",
    eventId: `e2e-refund-${purchase.id}`,
    rawEventType: "payment.refunded",
  });
  await page.goto("/billing?checkout=success");
  await expect(page.getByTestId("purchase-row")).toContainText("已退款");
  await expect(page.getByTestId("checkout-status")).toHaveCount(0);
});

test("checkout API needs a session and a valid pack", async ({
  request,
  context,
  isMobile,
}) => {
  test.skip(isMobile, "API-only");
  const anonymous = await request.post(`${E2E_API_URL}/api/checkout`, {
    data: { packId: "starter" },
  });
  expect(anonymous.status()).toBe(401);
  await signIn(context);
  const tampered = await context.request.post(`${E2E_API_URL}/api/checkout`, {
    data: { packId: "enterprise", credits: 10000 },
  });
  expect(tampered.status()).toBe(400);
  expect((await tampered.json()).error.code).toBe("INVALID_INPUT");
  const list = await context.request.get(
    `${E2E_API_URL}/api/billing/purchases`,
  );
  expect(await list.json()).toEqual({ purchases: [] });
});

test("credit activity API needs a session and a valid cursor", async ({
  request,
  context,
  isMobile,
}) => {
  test.skip(isMobile, "API-only");
  const anonymous = await request.get(
    `${E2E_API_URL}/api/billing/credit-activity`,
  );
  expect(anonymous.status()).toBe(401);
  await signIn(context);
  const list = await context.request.get(
    `${E2E_API_URL}/api/billing/credit-activity`,
  );
  const body = await list.json();
  expect(body.nextCursor).toBeNull();
  expect(body.transactions).toMatchObject([
    { type: "SIGNUP_BONUS", amount: 10, balanceAfter: 10 },
  ]);
  const bad = await context.request.get(
    `${E2E_API_URL}/api/billing/credit-activity?cursor=nope`,
  );
  expect(bad.status()).toBe(400);
});

test("checkout status stops refreshing in a hidden tab", async ({
  page,
  context,
}) => {
  await signIn(context);
  await page.goto("/pricing");
  await page.getByRole("button", { name: "购买 Creator" }).click();
  await expect(page.getByTestId("checkout-status")).toContainText("已收到付款");
  const refreshes: string[] = [];
  page.on("request", (request) => {
    if (request.headers()["rsc"] && request.url().includes("/billing"))
      refreshes.push(request.url());
  });
  const setVisibility = (state: "hidden" | "visible") =>
    page.evaluate((value) => {
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => value,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    }, state);
  await setVisibility("hidden");
  await page.waitForTimeout(3_500);
  refreshes.length = 0;
  await page.waitForTimeout(7_000);
  expect(refreshes).toHaveLength(0);
  await setVisibility("visible");
  await expect.poll(() => refreshes.length).toBeGreaterThan(0);
});

// A paid subscription for the signed-in user, with its period end set by a status event.
async function paidSubscription(
  context: import("@playwright/test").BrowserContext,
  userId: string,
  // null: paid, but the activation event has not arrived yet.
  status: "ACTIVE" | "PAST_DUE" | null,
) {
  const checkout = await context.request.post(`${E2E_API_URL}/api/checkout`, {
    data: { planId: "monthly" },
  });
  expect(checkout.status()).toBe(201);
  const [sub] = await testDb()
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId));
  const service = createBillingService({
    database: testDb(),
    provider: createFakePaymentProvider(),
    successUrl: `${e2eEnv.APP_URL}/billing?checkout=success`,
    subscriptionSuccessUrl: `${e2eEnv.APP_URL}/billing?checkout=subscription`,
  });
  const order = {
    subscriptionId: sub.id,
    providerOrderId: `fake_sub_ord_${sub.id}`,
    payload: {},
  };
  await service.handleWebhookEvent({
    ...order,
    type: "subscription.payment_succeeded",
    eventId: `e2e-paid-${sub.id}`,
    providerPaymentId: `fake_pay_${sub.id}`,
    rawEventType: "subscription.payment_succeeded",
  });
  if (!status) return;
  await service.handleWebhookEvent({
    ...order,
    type: "subscription.status_changed",
    eventId: `e2e-status-${sub.id}`,
    status,
    occurredAt: new Date().toISOString(),
    currentPeriodEnd: "2026-11-05",
    rawEventType: "subscription.renewed",
  });
}

test("shows the active subscription and cancels it at the period end", async ({
  page,
  context,
}) => {
  const { userId } = await signIn(context);
  await paidSubscription(context, userId, "ACTIVE");
  await page.goto("/billing");
  const section = page.getByTestId("subscription");
  await expect(section).toContainText("月度");
  await expect(section).toContainText("生效中");
  await expect(section).toContainText("2026年11月5日 自动续费");
  await section.getByRole("button", { name: "取消订阅" }).click();
  await section.getByRole("button", { name: "确认取消" }).click();
  await expect(section).toContainText("即将结束");
  await expect(section).toContainText("2026年11月5日 结束");
  await expect(section.getByRole("button", { name: "取消订阅" })).toHaveCount(
    0,
  );
});

test("a paid subscription waiting for activation shows no cancel button yet", async ({
  page,
  context,
}) => {
  const { userId } = await signIn(context);
  await paidSubscription(context, userId, null);
  await page.goto("/billing");
  const section = page.getByTestId("subscription");
  await expect(section).toContainText("月度");
  await expect(section).toContainText("生效中");
  // The cancel API accepts only activated subscriptions; Waffo activates in seconds.
  await expect(section.getByRole("button", { name: "取消订阅" })).toHaveCount(
    0,
  );
});

test("a past-due subscription links to the provider's customer portal to update the card", async ({
  page,
  context,
}) => {
  const { userId } = await signIn(context);
  await paidSubscription(context, userId, "PAST_DUE");
  await page.goto("/billing");
  const section = page.getByTestId("subscription");
  await expect(section).toContainText("付款失败");
  await expect(
    section.getByRole("link", { name: "更新付款方式" }),
  ).toHaveAttribute("href", FAKE_CUSTOMER_PORTAL_URL);
});

test("subscription cancel API needs a session and a subscription", async ({
  request,
  context,
  isMobile,
}) => {
  test.skip(isMobile, "API-only");
  const url = `${E2E_API_URL}/api/billing/subscription/cancel`;
  // As the browser sends it; a body-less post without an Origin fails the CSRF check.
  const headers = { origin: e2eEnv.APP_URL };
  expect((await request.post(url, { headers })).status()).toBe(401);
  await signIn(context);
  const none = await context.request.post(url, { headers });
  expect(none.status()).toBe(404);
  expect((await none.json()).error.code).toBe("SUBSCRIPTION_NOT_FOUND");
});
