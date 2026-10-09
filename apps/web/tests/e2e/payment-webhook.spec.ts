import { expect, test } from "@playwright/test";
import { eq } from "drizzle-orm";

import { createCreditService } from "@repo/credits/credit-service";
import { creditTransactions, purchases, subscriptions } from "@repo/db/schema";
import { closeTestDb, testDb } from "@repo/db/testing/db";

import { signIn } from "../setup/sign-in";

// API-only; one browser project is enough. E2E runs with PAYMENT_PROVIDER=fake.
test.skip(({ isMobile }) => isMobile);
test.afterAll(closeTestDb);

const URL = "/api/webhooks/waffo";
const signed = { "x-fake-signature": "fake-payment-signature" };

test("verified webhooks grant once and refunds reverse", async ({
  context,
  request,
}) => {
  const { userId } = await signIn(context);
  const checkout = await context.request.post("/api/checkout", {
    data: { packId: "starter" },
  });
  expect(checkout.status()).toBe(201);
  const [purchase] = await testDb()
    .select()
    .from(purchases)
    .where(eq(purchases.userId, userId));
  // Ids are unique per run: the local E2E database keeps rows between runs.
  const event = (type: string, eventId: string) => ({
    type,
    eventId: `${eventId}-${purchase.id}`,
    purchaseId: purchase.id,
    providerOrderId: `fake_ord_${purchase.id}`,
  });

  const forged = await request.post(URL, {
    headers: { "x-fake-signature": "wrong" },
    data: event("payment.succeeded", "e1"),
  });
  expect(forged.status()).toBe(401);

  for (let i = 0; i < 3; i++) {
    const ok = await request.post(URL, {
      headers: signed,
      data: event("payment.succeeded", "e1"),
    });
    expect(ok.status()).toBe(200);
  }
  const balance = () => createCreditService(testDb()).getBalance(userId);
  expect(await balance()).toBe(60);
  const grants = await testDb()
    .select()
    .from(creditTransactions)
    .where(eq(creditTransactions.purchaseId, purchase.id));
  expect(grants).toHaveLength(1);

  const ignored = await request.post(URL, {
    headers: signed,
    data: event("refund.failed", "e2"),
  });
  expect(ignored.status()).toBe(200);
  expect(await balance()).toBe(60);

  const refund = await request.post(URL, {
    headers: signed,
    data: event("payment.refunded", "e3"),
  });
  expect(refund.status()).toBe(200);
  expect(await balance()).toBe(10);
});

test("a subscription grants each payment once and blocks a second subscription", async ({
  context,
  request,
}) => {
  const { userId } = await signIn(context);
  const checkout = () =>
    context.request.post("/api/checkout", { data: { planId: "monthly" } });
  expect((await checkout()).status()).toBe(201);
  const [sub] = await testDb()
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId));
  const paymentId = `fake_pay_${sub.id}`;
  for (let i = 0; i < 3; i++) {
    const ok = await request.post(URL, {
      headers: signed,
      data: {
        type: "subscription.payment_succeeded",
        eventId: `paid-${sub.id}`,
        subscriptionId: sub.id,
        providerOrderId: `fake_sub_ord_${sub.id}`,
        providerPaymentId: paymentId,
      },
    });
    expect(ok.status()).toBe(200);
  }
  const balance = () => createCreditService(testDb()).getBalance(userId);
  expect(await balance()).toBe(70);

  const second = await checkout();
  expect(second.status()).toBe(409);
  expect((await second.json()).error.code).toBe("SUBSCRIPTION_EXISTS");

  const statusOf = async () =>
    (
      await testDb()
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.id, sub.id))
    )[0].status;
  const change = (status: string, occurredAt: string) =>
    request.post(URL, {
      headers: signed,
      data: {
        type: "subscription.status_changed",
        eventId: `${status}-${occurredAt}-${sub.id}`,
        subscriptionId: sub.id,
        providerOrderId: `fake_sub_ord_${sub.id}`,
        status,
        occurredAt,
      },
    });
  expect((await change("CANCELING", "2026-10-09T00:00:00Z")).status()).toBe(
    200,
  );
  expect(await statusOf()).toBe("CANCELING");
  // An older event that arrives late does not undo the newer one.
  expect((await change("ACTIVE", "2026-10-08T00:00:00Z")).status()).toBe(200);
  expect(await statusOf()).toBe("CANCELING");

  const refund = await request.post(URL, {
    headers: signed,
    data: {
      type: "subscription.payment_refunded",
      eventId: `refund-${sub.id}`,
      subscriptionId: sub.id,
      providerOrderId: `fake_sub_ord_${sub.id}`,
      providerPaymentId: paymentId,
    },
  });
  expect(refund.status()).toBe(200);
  expect(await balance()).toBe(10);
  expect(await statusOf()).toBe("CANCELING");
});

test("rejects an event that the configured provider did not sign", async ({
  request,
}) => {
  const unsigned = await request.post(URL, { data: {} });
  expect(unsigned.status()).toBe(401);
});
