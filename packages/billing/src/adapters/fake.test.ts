import { describe, expect, it } from "vitest";

import {
  createFakePaymentProvider,
  FAKE_CUSTOMER_PORTAL_URL,
  fakeWebhookRequest,
} from "./fake";
import { PaymentSignatureError } from "../types";

const input = {
  purchaseId: "11111111-1111-4111-8111-111111111111",
  userId: "a",
  email: "a@example.com",
  packId: "starter" as const,
  amountUsdCents: 900,
  successUrl: "http://localhost:3000/billing?checkout=success",
};

describe("FakePaymentProvider", () => {
  it("has a customer portal url that is not Waffo's", () => {
    expect(FAKE_CUSTOMER_PORTAL_URL).toMatch(/^https:\/\/example\.com\//);
    expect(createFakePaymentProvider().customerPortalUrl).toBe(
      FAKE_CUSTOMER_PORTAL_URL,
    );
  });

  it("returns a checkout url that lands on the success url, with a session id", async () => {
    const result = await createFakePaymentProvider().createCheckout(input);
    expect(result.checkoutUrl).toBe(input.successUrl);
    expect(result.providerSessionId).toMatch(/^fake_cs_/);
  });

  it("returns a subscription checkout url that lands on the success url", async () => {
    const result = await createFakePaymentProvider().createSubscriptionCheckout(
      {
        subscriptionId: input.purchaseId,
        userId: "a",
        email: "a@example.com",
        planId: "monthly",
        successUrl: input.successUrl,
      },
    );
    expect(result.checkoutUrl).toBe(input.successUrl);
    expect(result.providerSessionId).toMatch(/^fake_cs_/);
  });

  it.each([
    "subscription.payment_succeeded",
    "subscription.status_changed",
    "subscription.payment_refunded",
  ] as const)("verifies a signed %s event", async (type) => {
    const event = await createFakePaymentProvider().verifyWebhook(
      fakeWebhookRequest({
        type,
        eventId: "e1",
        subscriptionId: input.purchaseId,
        providerOrderId: "fake_ord_1",
        providerPaymentId: "fake_pay_1",
        status: "ACTIVE",
        occurredAt: "2026-10-08T03:55:29.281Z",
      }),
    );
    expect(event).toMatchObject({
      type,
      eventId: "e1",
      subscriptionId: input.purchaseId,
      providerOrderId: "fake_ord_1",
      rawEventType: type,
    });
  });

  it("cancels a subscription, or simulates a failure", async () => {
    await expect(
      createFakePaymentProvider().cancelSubscription({
        providerOrderId: "fake_ord_1",
      }),
    ).resolves.toEqual({ status: "CANCELING" });
    await expect(
      createFakePaymentProvider({ failCancel: true }).cancelSubscription({
        providerOrderId: "fake_ord_1",
      }),
    ).rejects.toThrow();
  });

  it("can simulate a checkout failure", async () => {
    await expect(
      createFakePaymentProvider({ failCheckout: true }).createCheckout(input),
    ).rejects.toThrow();
  });

  it.each(["payment.succeeded", "payment.refunded"] as const)(
    "verifies a signed %s event",
    async (type) => {
      const event = await createFakePaymentProvider().verifyWebhook(
        fakeWebhookRequest({
          type,
          eventId: "e1",
          purchaseId: input.purchaseId,
          providerOrderId: "fake_ord_1",
        }),
      );
      expect(event).toMatchObject({
        type,
        eventId: "e1",
        purchaseId: input.purchaseId,
        providerOrderId: "fake_ord_1",
        rawEventType: type,
      });
    },
  );

  it("rejects an invalid signature", async () => {
    const request = fakeWebhookRequest(
      {
        type: "payment.succeeded",
        eventId: "e1",
        purchaseId: input.purchaseId,
        providerOrderId: "o",
      },
      { signature: "wrong" },
    );
    await expect(
      createFakePaymentProvider().verifyWebhook(request),
    ).rejects.toBeInstanceOf(PaymentSignatureError);
  });

  it("returns null for an irrelevant event type", async () => {
    const request = fakeWebhookRequest({
      type: "subscription.renewed",
      eventId: "e1",
      purchaseId: input.purchaseId,
      providerOrderId: "o",
    });
    expect(await createFakePaymentProvider().verifyWebhook(request)).toBeNull();
  });
});
