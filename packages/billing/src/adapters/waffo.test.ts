import { generateKeyPairSync, sign } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { PaymentSignatureError } from "../types";
import {
  createWaffoPaymentProvider,
  WAFFO_PRODUCT_IDS,
  WAFFO_SUBSCRIPTION_PRODUCT_IDS,
} from "./waffo";

const keys = () =>
  generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
const merchant = keys();
const platform = keys();
const PURCHASE = "11111111-1111-4111-8111-111111111111";

function provider(fetcher = vi.fn<typeof fetch>()) {
  return createWaffoPaymentProvider({
    merchantId: "MER_2aUyqjCzEIiEcYMKj7TZtw",
    privateKey: merchant.privateKey,
    environment: "test",
    webhookPublicKey: platform.publicKey,
    fetch: fetcher,
  });
}

function webhook(
  event: Record<string, unknown>,
  { key = platform.privateKey, t = Date.now() } = {},
) {
  const body = JSON.stringify(event);
  const v1 = sign("sha256", Buffer.from(`${t}.${body}`), key).toString(
    "base64",
  );
  return new Request("https://app.test/api/webhooks/waffo", {
    method: "POST",
    headers: { "X-Waffo-Signature": `t=${t},v1=${v1}` },
    body,
  });
}
const event = (eventType: string, eventId: string, data = {}) => ({
  id: eventId,
  timestamp: "2026-10-05T06:27:28.194Z",
  eventType,
  eventId,
  storeId: "STO_4UqiJZo5uLS2czSPukm5HK",
  storeName: "Acme",
  mode: "test",
  data: {
    orderId: "ORD_05n7alR0iGcsEQ94IgCZ0N",
    paymentId: "PAY_4zEBE7Ml3JZwPQEJ2q6gDr",
    orderMerchantExternalId: PURCHASE,
    orderMetadata: { purchaseId: PURCHASE, userId: "a" },
    ...data,
  },
});

it("links customers to the Waffo customer portal", () => {
  expect(provider().customerPortalUrl).toBe(
    "https://pancake.waffo.ai/consumer/portal/login",
  );
});

describe("createCheckout", () => {
  it("creates a session for the pack's product, keyed by the purchase", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        data: {
          sessionId: "cs_67ad72c4-410e-4002-faa8-3c5a4acda1a2",
          checkoutUrl: "https://pancake.waffo.ai/store/x/checkout/cs_1",
          expiresAt: "2026-10-05T07:09:59.772Z",
        },
      }),
    );
    await expect(
      provider(fetcher).createCheckout({
        purchaseId: PURCHASE,
        userId: "a",
        email: "a@example.com",
        packId: "creator",
        amountUsdCents: 1900,
        successUrl: "https://app.test/billing?checkout=success",
      }),
    ).resolves.toEqual({
      checkoutUrl: "https://pancake.waffo.ai/store/x/checkout/cs_1",
      providerSessionId: "cs_67ad72c4-410e-4002-faa8-3c5a4acda1a2",
    });
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("https://api.waffo.ai/v1/actions/checkout/create-session");
    expect(init?.headers).toMatchObject({
      "X-Merchant-Id": "MER_2aUyqjCzEIiEcYMKj7TZtw",
      "X-Idempotency-Key": `MER_2aUyqjCzEIiEcYMKj7TZtw-checkout-${PURCHASE}`,
    });
    expect(JSON.parse(init!.body as string)).toMatchObject({
      productId: WAFFO_PRODUCT_IDS.creator,
      currency: "USD",
      buyerEmail: "a@example.com",
      successUrl: "https://app.test/billing?checkout=success",
      orderMerchantExternalId: PURCHASE,
      metadata: { purchaseId: PURCHASE, userId: "a" },
    });
  });

  it("throws when Waffo rejects the request", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json(
          { data: null, errors: [{ message: "Store is not approved" }] },
          { status: 403 },
        ),
      );
    await expect(
      provider(fetcher).createCheckout({
        purchaseId: PURCHASE,
        userId: "a",
        email: "a@example.com",
        packId: "starter",
        amountUsdCents: 900,
        successUrl: "https://app.test/s",
      }),
    ).rejects.toThrow();
  });
});

describe("createSubscriptionCheckout", () => {
  it("creates a session for the plan's product, keyed by the subscription", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        data: {
          sessionId: "cs_2986457e-d8e8-dedc-7384-1ab88378505a",
          checkoutUrl: "https://pancake.waffo.ai/store/x/checkout/cs_2",
          expiresAt: "2026-10-08T04:37:51.858Z",
        },
      }),
    );
    await expect(
      provider(fetcher).createSubscriptionCheckout({
        subscriptionId: PURCHASE,
        userId: "a",
        email: "a@example.com",
        planId: "monthly",
        successUrl: "https://app.test/billing?checkout=success",
      }),
    ).resolves.toEqual({
      checkoutUrl: "https://pancake.waffo.ai/store/x/checkout/cs_2",
      providerSessionId: "cs_2986457e-d8e8-dedc-7384-1ab88378505a",
    });
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("https://api.waffo.ai/v1/actions/checkout/create-session");
    expect(init?.headers).toMatchObject({
      "X-Idempotency-Key": `MER_2aUyqjCzEIiEcYMKj7TZtw-subscription-${PURCHASE}`,
    });
    expect(JSON.parse(init!.body as string)).toMatchObject({
      productId: WAFFO_SUBSCRIPTION_PRODUCT_IDS.monthly,
      currency: "USD",
      buyerEmail: "a@example.com",
      successUrl: "https://app.test/billing?checkout=success",
      orderMerchantExternalId: PURCHASE,
      metadata: { subscriptionId: PURCHASE, userId: "a" },
    });
  });
});

describe("cancelSubscription", () => {
  it.each([
    ["canceling", "CANCELING"],
    ["canceled", "CANCELED"],
  ])("cancels the order and maps %s", async (waffo, status) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        data: { orderId: "ORD_5QaU68WGdqZ92BQIuX8jkw", status: waffo },
      }),
    );
    await expect(
      provider(fetcher).cancelSubscription({
        providerOrderId: "ORD_5QaU68WGdqZ92BQIuX8jkw",
      }),
    ).resolves.toEqual({ status });
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe(
      "https://api.waffo.ai/v1/actions/subscription-order/cancel-order",
    );
    expect(JSON.parse(init!.body as string)).toEqual({
      orderId: "ORD_5QaU68WGdqZ92BQIuX8jkw",
    });
  });

  it("throws on an unexpected status", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        data: { orderId: "ORD_5QaU68WGdqZ92BQIuX8jkw", status: "active" },
      }),
    );
    await expect(
      provider(fetcher).cancelSubscription({
        providerOrderId: "ORD_5QaU68WGdqZ92BQIuX8jkw",
      }),
    ).rejects.toThrow();
  });
});

describe("verifyWebhook", () => {
  it("normalizes subscription.payment_succeeded, keyed by the payment", async () => {
    const raw = event(
      "subscription.payment_succeeded",
      "PAY_2t8CNJY6UpQj8wn3fWvqgH",
      {
        orderId: "ORD_5QaU68WGdqZ92BQIuX8jkw",
        paymentId: "PAY_2t8CNJY6UpQj8wn3fWvqgH",
        orderMetadata: { subscriptionId: PURCHASE, userId: "a" },
      },
    );
    await expect(provider().verifyWebhook(webhook(raw))).resolves.toEqual({
      type: "subscription.payment_succeeded",
      eventId: "subscription.payment_succeeded:PAY_2t8CNJY6UpQj8wn3fWvqgH",
      subscriptionId: PURCHASE,
      providerOrderId: "ORD_5QaU68WGdqZ92BQIuX8jkw",
      providerPaymentId: "PAY_2t8CNJY6UpQj8wn3fWvqgH",
      rawEventType: "subscription.payment_succeeded",
      payload: raw,
    });
  });

  it("normalizes subscription.activated to a status change from orderStatus", async () => {
    const raw = event("subscription.activated", "ORD_5QaU68WGdqZ92BQIuX8jkw", {
      orderId: "ORD_5QaU68WGdqZ92BQIuX8jkw",
      paymentId: undefined,
      orderMerchantExternalId: undefined,
      orderMetadata: { subscriptionId: PURCHASE, userId: "a" },
      orderStatus: "active",
      currentPeriodEnd: "2026-11-08",
    });
    await expect(provider().verifyWebhook(webhook(raw))).resolves.toEqual({
      type: "subscription.status_changed",
      eventId: "subscription.activated:ORD_5QaU68WGdqZ92BQIuX8jkw",
      subscriptionId: PURCHASE,
      providerOrderId: "ORD_5QaU68WGdqZ92BQIuX8jkw",
      status: "ACTIVE",
      occurredAt: "2026-10-05T06:27:28.194Z",
      currentPeriodEnd: "2026-11-08",
      rawEventType: "subscription.activated",
      payload: raw,
    });
  });

  it.each([
    ["subscription.renewed", "ORD_1-renewed-2026-11-08", "active", "ACTIVE"],
    [
      "subscription.recovered",
      "ORD_1-2026-10-08T03:59:29.695Z",
      "active",
      "ACTIVE",
    ],
    [
      "subscription.past_due",
      "ORD_1-2026-10-08T03:59:05.740Z",
      "past_due",
      "PAST_DUE",
    ],
    [
      "subscription.canceling",
      "ORD_1-2026-10-08T03:59:50.935Z",
      "canceling",
      "CANCELING",
    ],
    [
      "subscription.uncanceled",
      "ORD_1-2026-10-08T04:00:00.000Z",
      "active",
      "ACTIVE",
    ],
    ["subscription.canceled", "ORD_1", "canceled", "CANCELED"],
    ["subscription.canceled", "ORD_2", "expired", "CANCELED"],
  ])(
    "maps %s with orderStatus %s",
    async (type, eventId, orderStatus, status) => {
      const raw = event(type, eventId, { orderStatus });
      await expect(
        provider().verifyWebhook(webhook(raw)),
      ).resolves.toMatchObject({
        type: "subscription.status_changed",
        eventId: `${type}:${eventId}`,
        subscriptionId: PURCHASE,
        status,
      });
    },
  );

  it("ignores a status event without a known orderStatus", async () => {
    for (const orderStatus of [undefined, "closed"])
      await expect(
        provider().verifyWebhook(
          webhook(event("subscription.renewed", "ORD_1-r", { orderStatus })),
        ),
      ).resolves.toBeNull();
  });

  it("normalizes order.completed to payment.succeeded", async () => {
    const raw = event("order.completed", "PAY_4zEBE7Ml3JZwPQEJ2q6gDr");
    await expect(provider().verifyWebhook(webhook(raw))).resolves.toEqual({
      type: "payment.succeeded",
      eventId: "order.completed:PAY_4zEBE7Ml3JZwPQEJ2q6gDr",
      purchaseId: PURCHASE,
      providerOrderId: "ORD_05n7alR0iGcsEQ94IgCZ0N",
      providerPaymentId: "PAY_4zEBE7Ml3JZwPQEJ2q6gDr",
      rawEventType: "order.completed",
      payload: raw,
    });
  });

  it("normalizes a refund of a subscription payment", async () => {
    const raw = event("refund.succeeded", "REF_3MRCXS51pV5Nk7aaHlUcqq", {
      orderId: "ORD_5QaU68WGdqZ92BQIuX8jkw",
      paymentId: "PAY_0PhsWf66yNxKMre8ma1zes",
      orderMerchantExternalId: undefined,
      orderMetadata: { subscriptionId: PURCHASE, userId: "a" },
      refundedAmount: "9.90",
      originalChargedAmount: "9.90",
      originalPayment: { total: "9.90" },
      periodNumber: 5,
    });
    await expect(provider().verifyWebhook(webhook(raw))).resolves.toEqual({
      type: "subscription.payment_refunded",
      eventId: "refund.succeeded:REF_3MRCXS51pV5Nk7aaHlUcqq",
      subscriptionId: PURCHASE,
      providerOrderId: "ORD_5QaU68WGdqZ92BQIuX8jkw",
      providerPaymentId: "PAY_0PhsWf66yNxKMre8ma1zes",
      refundedAmountUsdCents: 990,
      paidAmountUsdCents: 990,
      rawEventType: "refund.succeeded",
      payload: raw,
    });
  });

  it("normalizes refund.succeeded to payment.refunded", async () => {
    const raw = event("refund.succeeded", "REF_4AmMxRhzAYhv6uV1iEcyVu", {
      refundedAmount: "9.00",
    });
    await expect(provider().verifyWebhook(webhook(raw))).resolves.toMatchObject(
      {
        type: "payment.refunded",
        eventId: "refund.succeeded:REF_4AmMxRhzAYhv6uV1iEcyVu",
        purchaseId: PURCHASE,
        providerOrderId: "ORD_05n7alR0iGcsEQ94IgCZ0N",
        refundedAmountUsdCents: 900,
        rawEventType: "refund.succeeded",
      },
    );
  });

  it.each([
    ["4.50", 450],
    ["1", 100],
    ["19.00", 1900],
  ])("parses refundedAmount %s as %i cents", async (amount, cents) => {
    const raw = event("refund.succeeded", "REF_1", { refundedAmount: amount });
    await expect(provider().verifyWebhook(webhook(raw))).resolves.toMatchObject(
      { refundedAmountUsdCents: cents },
    );
  });

  // originalPayment.total is the list price; originalChargedAmount is what the
  // payment collected (SDK docs/webhook-guide.md). Discounts make them differ.
  it.each([
    ["a Credit Pack", {}],
    ["a subscription", { orderMetadata: { subscriptionId: PURCHASE } }],
  ])(
    "uses originalChargedAmount, not the list price, as the paid amount for %s",
    async (_, extra) => {
      const raw = event("refund.succeeded", "REF_1", {
        refundedAmount: "19.90",
        originalChargedAmount: "19.90",
        originalPayment: { total: "24.90" },
        ...extra,
      });
      await expect(
        provider().verifyWebhook(webhook(raw)),
      ).resolves.toMatchObject({
        refundedAmountUsdCents: 1990,
        paidAmountUsdCents: 1990,
      });
    },
  );

  it("leaves the paid amount unset when Waffo reports no collected amount", async () => {
    const raw = event("refund.succeeded", "REF_1", {
      refundedAmount: "1.00",
      originalPayment: { total: "9.00" },
    });
    const normalized = await provider().verifyWebhook(webhook(raw));
    expect(normalized).toMatchObject({ refundedAmountUsdCents: 100 });
    expect(normalized).toHaveProperty("paidAmountUsdCents", undefined);
  });

  it("falls back to metadata when the external id is missing", async () => {
    const raw = event("order.completed", "PAY_1", {
      orderMerchantExternalId: undefined,
    });
    await expect(provider().verifyWebhook(webhook(raw))).resolves.toMatchObject(
      { purchaseId: PURCHASE },
    );
  });

  it("returns null for events the business does not handle", async () => {
    for (const type of ["refund.failed", "subscription.plan_changed"])
      await expect(
        provider().verifyWebhook(webhook(event(type, "X_1"))),
      ).resolves.toBeNull();
  });

  it.each([
    [
      "a tampered body",
      () => {
        const r = webhook(event("order.completed", "PAY_1"));
        return new Request(r.url, {
          method: "POST",
          headers: r.headers,
          body: JSON.stringify(event("order.completed", "PAY_2")),
        });
      },
    ],
    [
      "a foreign key",
      () =>
        webhook(event("order.completed", "PAY_1"), {
          key: merchant.privateKey,
        }),
    ],
    [
      "a stale timestamp",
      () =>
        webhook(event("order.completed", "PAY_1"), {
          t: Date.now() - 46 * 60_000,
        }),
    ],
    [
      "a missing header",
      () => new Request("https://app.test/x", { method: "POST", body: "{}" }),
    ],
    [
      "another environment",
      () => webhook({ ...event("order.completed", "PAY_1"), mode: "prod" }),
    ],
  ])("rejects %s", async (_, request) => {
    await expect(provider().verifyWebhook(request())).rejects.toBeInstanceOf(
      PaymentSignatureError,
    );
  });
});
