import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeAnalyticsProvider } from "@repo/analytics/adapters/fake";
import { createAnalyticsService } from "@repo/analytics/analytics-service";
import { createCreditService } from "@repo/credits/credit-service";
import {
  creditTransactions,
  paymentEvents,
  purchases,
  subscriptions,
  user,
} from "@repo/db/schema";
import { closeTestDb, resetDb, testDb } from "@repo/db/testing/db";
import { AppError } from "@repo/observability/errors";

import { createFakePaymentProvider } from "./adapters/fake";
import { createBillingService } from "./billing-service";
import type { PaymentWebhookEvent } from "./types";

const db = testDb();
const APP_URL = "http://localhost:3000";
const A = { id: "a", email: "a@example.com" };
let now = new Date("2026-10-05T12:00:00Z");
const service = (provider = createFakePaymentProvider()) =>
  createBillingService({
    database: db,
    provider,
    successUrl: `${APP_URL}/billing?checkout=success`,
    subscriptionSuccessUrl: `${APP_URL}/billing?checkout=subscription`,
    now: () => now,
  });

beforeEach(async () => {
  now = new Date("2026-10-05T12:00:00Z");
  await resetDb();
  await db.insert(user).values([
    { id: "a", name: "A", email: A.email },
    { id: "b", name: "B", email: "b@example.com" },
  ]);
});
afterAll(closeTestDb);

const onlyPurchase = async () => {
  const rows = await db.select().from(purchases);
  expect(rows).toHaveLength(1);
  return rows[0];
};
const ledger = (type: "PURCHASE" | "PURCHASE_REVERSAL") =>
  db.select().from(creditTransactions).where(eq(creditTransactions.type, type));
const balance = (id = "a") => createCreditService(db).getBalance(id);

async function checkout(packId = "starter") {
  await service().createCheckout(A, { packId });
  return onlyPurchase();
}
const succeeded = (
  purchaseId: string,
  eventId = "succeeded-1",
): PaymentWebhookEvent => ({
  type: "payment.succeeded",
  eventId,
  purchaseId,
  providerOrderId: "fake_ord_1",
  providerPaymentId: "fake_pay_1",
  rawEventType: "order.completed",
  payload: { raw: true },
});
const refunded = (
  purchaseId: string,
  eventId = "refunded-1",
  refundedAmountUsdCents?: number,
  paidAmountUsdCents?: number,
): PaymentWebhookEvent => ({
  type: "payment.refunded",
  eventId,
  purchaseId,
  providerOrderId: "fake_ord_1",
  refundedAmountUsdCents,
  paidAmountUsdCents,
  rawEventType: "refund.succeeded",
  payload: {},
});

describe("createCheckout", () => {
  it("creates a PENDING purchase priced from the server pack table", async () => {
    const result = await service().createCheckout(A, {
      packId: "creator",
      credits: 10000,
      price: 1,
    });
    const p = await onlyPurchase();
    expect(p).toMatchObject({
      userId: "a",
      provider: "fake",
      packId: "creator",
      amountUsd: 4990,
      credits: 150,
      status: "PENDING",
      providerOrderId: null,
    });
    expect(p.providerSessionId).toMatch(/^fake_cs_/);
    expect(result).toEqual({
      checkoutUrl: `${APP_URL}/billing?checkout=success`,
    });
  });

  it.each([{ packId: "enterprise" }, { packId: 1 }, {}, null])(
    "rejects a tampered pack id %j",
    async (body) => {
      await expect(service().createCheckout(A, body)).rejects.toMatchObject({
        code: "INVALID_INPUT",
      });
      expect(await db.select().from(purchases)).toHaveLength(0);
    },
  );

  it("marks the purchase FAILED and returns PAYMENT_ERROR when the provider fails", async () => {
    const error = await service(
      createFakePaymentProvider({ failCheckout: true }),
    )
      .createCheckout(A, { packId: "starter" })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ code: "PAYMENT_ERROR" });
    expect((await onlyPurchase()).status).toBe("FAILED");
  });

  it("does not grant credits on checkout or redirect", async () => {
    await checkout();
    expect(await balance()).toBe(0);
  });
});

describe("handleWebhookEvent", () => {
  it("marks the purchase PAID and grants its credits", async () => {
    const p = await checkout();
    await service().handleWebhookEvent(succeeded(p.id));
    expect(await onlyPurchase()).toMatchObject({
      status: "PAID",
      providerOrderId: "fake_ord_1",
      providerPaymentId: "fake_pay_1",
    });
    expect((await onlyPurchase()).completedAt).not.toBeNull();
    expect(await balance()).toBe(50);
    const [event] = await db.select().from(paymentEvents);
    expect(event).toMatchObject({
      provider: "fake",
      providerEventId: "succeeded-1",
      eventType: "order.completed",
      payload: { raw: true },
    });
    expect(event.processedAt).not.toBeNull();
  });

  it("grants once when the same event arrives 10 times", async () => {
    const p = await checkout();
    await Promise.all(
      Array.from({ length: 10 }, () =>
        service().handleWebhookEvent(succeeded(p.id)),
      ),
    );
    expect(await ledger("PURCHASE")).toHaveLength(1);
    expect(await db.select().from(paymentEvents)).toHaveLength(1);
    expect(await balance()).toBe(50);
  });

  it("grants once when different event ids point at the same order", async () => {
    const p = await checkout();
    for (const id of ["e1", "e2", "e3"])
      await service().handleWebhookEvent(succeeded(p.id, id));
    expect(await ledger("PURCHASE")).toHaveLength(1);
    expect(await balance()).toBe(50);
  });

  it("grants credits from the purchase snapshot, not the current pack table", async () => {
    const p = await checkout();
    await db
      .update(purchases)
      .set({ credits: 42 })
      .where(eq(purchases.id, p.id));
    await service().handleWebhookEvent(succeeded(p.id));
    expect(await balance()).toBe(42);
  });

  it("records but ignores events for unknown or invalid purchase ids", async () => {
    await service().handleWebhookEvent(
      succeeded("22222222-2222-4222-8222-222222222222"),
    );
    await service().handleWebhookEvent(succeeded("not-a-uuid", "e2"));
    expect(await ledger("PURCHASE")).toHaveLength(0);
    expect(await db.select().from(paymentEvents)).toHaveLength(2);
  });

  // The provider took the money, so a payment after our expiry still counts.
  it("grants once when the payment arrives after the purchase expired", async () => {
    const p = await checkout();
    now = new Date("2026-10-05T13:01:00Z");
    expect((await service().listPurchases("a"))[0].status).toBe("FAILED");
    await service().handleWebhookEvent(succeeded(p.id, "late-1"));
    await service().handleWebhookEvent(succeeded(p.id, "late-1"));
    await service().handleWebhookEvent(succeeded(p.id, "late-2"));
    expect(await onlyPurchase()).toMatchObject({
      status: "PAID",
      providerOrderId: "fake_ord_1",
      providerPaymentId: "fake_pay_1",
      completedAt: now,
    });
    expect(await ledger("PURCHASE")).toHaveLength(1);
    expect(await balance()).toBe(50);
  });

  it("does not grant credits to a REFUNDED purchase", async () => {
    const p = await checkout();
    await service().handleWebhookEvent(succeeded(p.id));
    await service().handleWebhookEvent(refunded(p.id));
    await service().handleWebhookEvent(succeeded(p.id, "succeeded-2"));
    expect((await onlyPurchase()).status).toBe("REFUNDED");
    expect(await ledger("PURCHASE")).toHaveLength(1);
    expect(await balance()).toBe(0);
  });

  it("reverses the full purchase when the balance covers it", async () => {
    const p = await checkout();
    await service().handleWebhookEvent(succeeded(p.id));
    await service().handleWebhookEvent(refunded(p.id));
    expect((await onlyPurchase()).status).toBe("REFUNDED");
    expect(await balance()).toBe(0);
    expect((await ledger("PURCHASE_REVERSAL"))[0].amount).toBe(-50);
  });

  it("reverses down to zero when the balance is short", async () => {
    const p = await checkout();
    await service().handleWebhookEvent(succeeded(p.id));
    await createCreditService(db).adminAdjust(
      "a",
      -20,
      "33333333-3333-4333-8333-333333333333",
      "test spend",
    );
    await service().handleWebhookEvent(refunded(p.id));
    expect(await balance()).toBe(0);
    expect((await ledger("PURCHASE_REVERSAL"))[0].amount).toBe(-30);
  });

  it("reverses once when the refund repeats", async () => {
    const p = await checkout();
    await service().handleWebhookEvent(succeeded(p.id));
    await service().handleWebhookEvent(refunded(p.id, "r1"));
    await service().handleWebhookEvent(refunded(p.id, "r2"));
    expect(await ledger("PURCHASE_REVERSAL")).toHaveLength(1);
  });

  it("remembers a zero reversal: a repeated refund after a top-up takes nothing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const p = await checkout();
    await service().handleWebhookEvent(succeeded(p.id));
    await createCreditService(db).adminAdjust(
      "a",
      -50,
      "55555555-5555-4555-8555-555555555555",
      "test spend",
    );
    await service().handleWebhookEvent(refunded(p.id, "r1"));
    expect((await onlyPurchase()).status).toBe("REFUNDED");
    await createCreditService(db).adminAdjust(
      "a",
      10,
      "66666666-6666-4666-8666-666666666666",
      "top-up",
    );
    await service().handleWebhookEvent(refunded(p.id, "r2"));
    expect(await balance()).toBe(10);
    expect(await ledger("PURCHASE_REVERSAL")).toHaveLength(0);
    vi.restoreAllMocks();
  });

  it.each([
    ["half", "creator", 2495, 75],
    ["rounding up", "starter", 100, 3],
    ["the full amount", "starter", 1990, 50],
    ["more than paid", "starter", 2100, 50],
  ])(
    "reverses credits in proportion to a partial refund: %s",
    async (_, packId, cents, reversed) => {
      const p = await checkout(packId);
      await service().handleWebhookEvent(succeeded(p.id));
      const before = await balance();
      await service().handleWebhookEvent(refunded(p.id, "r1", cents));
      expect(before - (await balance())).toBe(reversed);
      expect((await onlyPurchase()).status).toBe("REFUNDED");
      expect((await ledger("PURCHASE_REVERSAL"))[0].amount).toBe(-reversed);
    },
  );

  it("reverses in proportion to the amount the provider charged", async () => {
    // Example: a price change while checkout was open, so the charge differs from the snapshot.
    const p = await checkout("starter");
    await service().handleWebhookEvent(succeeded(p.id));
    const before = await balance();
    await service().handleWebhookEvent(refunded(p.id, "r1", 1990, 2490));
    expect(before - (await balance())).toBe(40);
  });

  it("caps a partial reversal at the balance", async () => {
    const p = await checkout("creator");
    await service().handleWebhookEvent(succeeded(p.id));
    await createCreditService(db).adminAdjust(
      "a",
      -100,
      "44444444-4444-4444-8444-444444444444",
      "test spend",
    );
    await service().handleWebhookEvent(refunded(p.id, "r1", 2495));
    expect(await balance()).toBe(0);
    expect((await ledger("PURCHASE_REVERSAL"))[0].amount).toBe(-50);
  });

  it("fails, so Waffo retries, when the refund arrives before its payment", async () => {
    const p = await checkout();
    await expect(
      service().handleWebhookEvent(refunded(p.id)),
    ).rejects.toBeDefined();
    expect((await onlyPurchase()).status).toBe("PENDING");
    const [inbox] = await db.select().from(paymentEvents);
    expect(inbox.processedAt).toBeNull();
  });

  it("applies a refund retried after its late payment", async () => {
    const p = await checkout();
    await expect(
      service().handleWebhookEvent(refunded(p.id)),
    ).rejects.toBeDefined();
    await service().handleWebhookEvent(succeeded(p.id));
    await service().handleWebhookEvent(refunded(p.id));
    expect(await balance()).toBe(0);
    expect((await onlyPurchase()).status).toBe("REFUNDED");
  });

  it("also retries a refund for an expired purchase", async () => {
    const p = await checkout();
    now = new Date(now.getTime() + 61 * 60_000);
    await service().listPurchases("a");
    expect((await onlyPurchase()).status).toBe("FAILED");
    await expect(
      service().handleWebhookEvent(refunded(p.id)),
    ).rejects.toBeDefined();
  });
});

describe("listPurchases", () => {
  it("lists only the user's purchases, newest first", async () => {
    await service().createCheckout(A, { packId: "starter" });
    now = new Date("2026-10-05T12:01:00Z");
    await service().createCheckout(A, { packId: "pro" });
    await service().createCheckout(
      { id: "b", email: "b@example.com" },
      { packId: "creator" },
    );
    const list = await service().listPurchases("a");
    expect(list.map((p) => p.packId)).toEqual(["pro", "starter"]);
  });

  it("expires PENDING purchases older than 60 minutes to FAILED", async () => {
    await service().createCheckout(A, { packId: "starter" });
    now = new Date("2026-10-05T12:59:00Z");
    expect((await service().listPurchases("a"))[0].status).toBe("PENDING");
    now = new Date("2026-10-05T13:01:00Z");
    expect((await service().listPurchases("a"))[0].status).toBe("FAILED");
    expect(await balance()).toBe(0);
  });
});

describe("analytics", () => {
  it("sends purchase_completed once per purchase, after the grant", async () => {
    const analyticsProvider = createFakeAnalyticsProvider();
    const analytics = createAnalyticsService({
      database: db,
      provider: analyticsProvider,
      productId: "acme",
    });
    await analytics.setConsent("a", true);
    const billing = createBillingService({
      database: db,
      provider: createFakePaymentProvider(),
      successUrl: `${APP_URL}/billing?checkout=success`,
      subscriptionSuccessUrl: `${APP_URL}/billing?checkout=subscription`,
      now: () => now,
      analytics,
    });
    await billing.createCheckout(A, { packId: "starter" });
    const p = await onlyPurchase();
    for (const eventId of ["e1", "e1", "e2"])
      await billing.handleWebhookEvent(succeeded(p.id, eventId));
    await billing.handleWebhookEvent(refunded(p.id));
    expect(analyticsProvider.events).toEqual([
      {
        distinctId: "a",
        event: "purchase_completed",
        properties: {
          purchaseId: p.id,
          packId: "starter",
          credits: 50,
          amountUsdCents: 1990,
          product_id: "acme",
        },
      },
    ]);
  });

  it("sends purchase_completed once for a payment after expiry", async () => {
    const analyticsProvider = createFakeAnalyticsProvider();
    const analytics = createAnalyticsService({
      database: db,
      provider: analyticsProvider,
      productId: "acme",
    });
    await analytics.setConsent("a", true);
    const billing = createBillingService({
      database: db,
      provider: createFakePaymentProvider(),
      successUrl: `${APP_URL}/billing?checkout=success`,
      subscriptionSuccessUrl: `${APP_URL}/billing?checkout=subscription`,
      now: () => now,
      analytics,
    });
    await billing.createCheckout(A, { packId: "starter" });
    const p = await onlyPurchase();
    now = new Date("2026-10-05T13:01:00Z");
    await billing.listPurchases("a");
    for (const eventId of ["e1", "e1", "e2"])
      await billing.handleWebhookEvent(succeeded(p.id, eventId));
    expect(
      analyticsProvider.events.filter((e) => e.event === "purchase_completed"),
    ).toHaveLength(1);
  });
});

describe("subscriptions", () => {
  const subscriptionsOf = (userId = "a") =>
    db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, userId))
      .orderBy(subscriptions.createdAt);
  async function subscribe() {
    await service().createCheckout(A, { planId: "monthly" });
    const rows = await subscriptionsOf();
    return rows[rows.length - 1];
  }
  const paid = (
    subscriptionId: string,
    paymentId = "fake_pay_1",
    eventId = `paid-${paymentId}`,
  ): PaymentWebhookEvent => ({
    type: "subscription.payment_succeeded",
    eventId,
    subscriptionId,
    providerOrderId: "fake_sub_ord_1",
    providerPaymentId: paymentId,
    rawEventType: "subscription.payment_succeeded",
    payload: {},
  });
  type Status = "ACTIVE" | "PAST_DUE" | "CANCELING" | "CANCELED";
  const changed = (
    subscriptionId: string,
    status: Status,
    occurredAt: string,
    currentPeriodEnd?: string,
  ): PaymentWebhookEvent => ({
    type: "subscription.status_changed",
    eventId: `changed-${status}-${occurredAt}`,
    subscriptionId,
    providerOrderId: "fake_sub_ord_1",
    status,
    occurredAt,
    currentPeriodEnd,
    rawEventType: "subscription.renewed",
    payload: {},
  });
  const activated = (subscriptionId: string) =>
    changed(subscriptionId, "ACTIVE", "2026-10-05T12:00:01Z", "2026-11-05");

  it("creates a PENDING subscription priced from the server plan table", async () => {
    const result = await service().createCheckout(A, {
      planId: "monthly",
      credits: 10000,
      price: 1,
    });
    const [sub] = await subscriptionsOf();
    expect(sub).toMatchObject({
      userId: "a",
      provider: "fake",
      planId: "monthly",
      amountUsd: 990,
      credits: 60,
      status: "PENDING",
      providerOrderId: null,
    });
    expect(sub.providerSessionId).toMatch(/^fake_cs_/);
    expect(result).toEqual({
      checkoutUrl: `${APP_URL}/billing?checkout=subscription`,
    });
    expect(await db.select().from(purchases)).toHaveLength(0);
  });

  it.each([{ planId: "yearly" }, { planId: 1 }])(
    "rejects a tampered plan id %j",
    async (body) => {
      await expect(service().createCheckout(A, body)).rejects.toMatchObject({
        code: "INVALID_INPUT",
      });
      expect(await subscriptionsOf()).toHaveLength(0);
    },
  );

  it("marks the subscription FAILED and returns PAYMENT_ERROR when the provider fails", async () => {
    await expect(
      service(createFakePaymentProvider({ failCheckout: true })).createCheckout(
        A,
        { planId: "monthly" },
      ),
    ).rejects.toMatchObject({ code: "PAYMENT_ERROR" });
    expect((await subscriptionsOf())[0].status).toBe("FAILED");
  });

  it("replaces an unpaid checkout instead of blocking a retry", async () => {
    const first = await subscribe();
    const second = await subscribe();
    const rows = await subscriptionsOf();
    expect(rows.map((r) => [r.id, r.status])).toEqual([
      [first.id, "FAILED"],
      [second.id, "PENDING"],
    ]);
  });

  it("rejects a new checkout once a subscription is paid, even before activation", async () => {
    const sub = await subscribe();
    await service().handleWebhookEvent(paid(sub.id));
    await expect(
      service().createCheckout(A, { planId: "monthly" }),
    ).rejects.toMatchObject({ code: "SUBSCRIPTION_EXISTS" });
    await service().createCheckout(
      { id: "b", email: "b@example.com" },
      { planId: "monthly" },
    );
    expect(await subscriptionsOf("b")).toHaveLength(1);
  });

  it("grants the first payment before activation, and activation sets ACTIVE", async () => {
    const sub = await subscribe();
    await service().handleWebhookEvent(paid(sub.id));
    expect(await balance()).toBe(60);
    expect((await subscriptionsOf())[0]).toMatchObject({
      status: "PENDING",
      providerOrderId: "fake_sub_ord_1",
    });
    await service().handleWebhookEvent(activated(sub.id));
    expect((await subscriptionsOf())[0].status).toBe("ACTIVE");
    expect(await balance()).toBe(60);
  });

  it("activates first and grants on the later payment", async () => {
    const sub = await subscribe();
    await service().handleWebhookEvent(activated(sub.id));
    expect((await subscriptionsOf())[0].status).toBe("ACTIVE");
    expect(await balance()).toBe(0);
    await service().handleWebhookEvent(paid(sub.id));
    expect(await balance()).toBe(60);
  });

  it("grants once per payment id, whatever the event id", async () => {
    const sub = await subscribe();
    for (let i = 0; i < 5; i++)
      await service().handleWebhookEvent(
        paid(sub.id, "fake_pay_1", `e${i % 2}`),
      );
    expect(await balance()).toBe(60);
    const grants = await db
      .select()
      .from(creditTransactions)
      .where(eq(creditTransactions.type, "SUBSCRIPTION_GRANT"));
    expect(grants).toHaveLength(1);
    expect(grants[0].subscriptionId).toBe(sub.id);
  });

  it("still grants a payment for a replaced checkout and reports it", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const first = await subscribe();
    await subscribe();
    await service().handleWebhookEvent(paid(first.id));
    expect(await balance()).toBe(60);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining(
        '"eventType":"billing.replaced_subscription_paid"',
      ),
    );
    vi.restoreAllMocks();
  });

  it("reports whether the newest subscription checkout has granted credits", async () => {
    expect(await service().subscriptionCheckoutStatus("a")).toBeNull();
    const sub = await subscribe();
    expect(await service().subscriptionCheckoutStatus("a")).toEqual({
      granted: false,
    });
    await service().handleWebhookEvent(activated(sub.id));
    expect(await service().subscriptionCheckoutStatus("a")).toEqual({
      granted: false,
    });
    await service().handleWebhookEvent(paid(sub.id));
    expect(await service().subscriptionCheckoutStatus("a")).toEqual({
      granted: true,
    });
    expect(await service().subscriptionCheckoutStatus("b")).toBeNull();
  });

  it("records but ignores events for unknown subscriptions", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await service().handleWebhookEvent(
      paid("00000000-0000-4000-8000-000000000000"),
    );
    await service().handleWebhookEvent(paid("not-a-uuid", "p2"));
    expect(await balance()).toBe(0);
    const events = await db.select().from(paymentEvents);
    expect(events.every((e) => e.processedAt)).toBe(true);
    vi.restoreAllMocks();
  });

  it("grants each renewal payment as a new period", async () => {
    const sub = await subscribe();
    await service().handleWebhookEvent(paid(sub.id, "fake_pay_1"));
    await service().handleWebhookEvent(paid(sub.id, "fake_pay_2"));
    expect(await balance()).toBe(120);
  });

  it("follows status events and keeps the current period end", async () => {
    const sub = await subscribe();
    const status = async () => {
      const [row] = await subscriptionsOf();
      return [row.status, row.currentPeriodEnd?.toISOString().slice(0, 10)];
    };
    await service().handleWebhookEvent(activated(sub.id));
    expect(await status()).toEqual(["ACTIVE", "2026-11-05"]);
    for (const [s, at, end] of [
      ["ACTIVE", "2026-11-05T12:00:00Z", "2026-12-05"],
      ["PAST_DUE", "2026-12-05T12:00:00Z", undefined],
      ["ACTIVE", "2026-12-06T12:00:00Z", "2027-01-05"],
      ["CANCELING", "2026-12-10T12:00:00Z", "2027-01-05"],
      ["CANCELED", "2027-01-05T12:00:00Z", undefined],
    ] as const) {
      await service().handleWebhookEvent(changed(sub.id, s, at, end));
      expect((await status())[0]).toBe(s);
    }
    expect(await status()).toEqual(["CANCELED", "2027-01-05"]);
  });

  it("ignores a status event older than the one already applied", async () => {
    const sub = await subscribe();
    await service().handleWebhookEvent(
      changed(sub.id, "CANCELING", "2026-12-10T12:00:00Z", "2027-01-05"),
    );
    await service().handleWebhookEvent(
      changed(sub.id, "ACTIVE", "2026-12-06T12:00:00Z", "2027-01-05"),
    );
    expect((await subscriptionsOf())[0].status).toBe("CANCELING");
  });

  it("allows a new subscription after the old one is canceled", async () => {
    const sub = await subscribe();
    await service().handleWebhookEvent(paid(sub.id));
    await service().handleWebhookEvent(
      changed(sub.id, "CANCELED", "2027-01-05T12:00:00Z"),
    );
    await service().createCheckout(A, { planId: "monthly" });
    expect(await subscriptionsOf()).toHaveLength(2);
  });

  describe("currentSubscription", () => {
    it("returns the paid subscription that is not canceled", async () => {
      expect(await service().currentSubscription("a")).toBeNull();
      const sub = await subscribe();
      expect(await service().currentSubscription("a")).toBeNull();
      await service().handleWebhookEvent(paid(sub.id));
      await service().handleWebhookEvent(
        changed(sub.id, "CANCELING", "2026-10-06T12:00:00Z", "2026-11-05"),
      );
      expect(await service().currentSubscription("a")).toEqual({
        id: sub.id,
        planId: "monthly",
        status: "CANCELING",
        currentPeriodEnd: new Date("2026-11-05T00:00:00Z"),
      });
      await service().handleWebhookEvent(
        changed(sub.id, "CANCELED", "2026-11-05T12:00:00Z"),
      );
      expect(await service().currentSubscription("a")).toBeNull();
    });

    it("expires an unpaid checkout older than 60 minutes", async () => {
      const sub = await subscribe();
      now = new Date(now.getTime() + 59 * 60_000);
      await service().currentSubscription("a");
      expect((await subscriptionsOf())[0].status).toBe("PENDING");
      now = new Date(now.getTime() + 2 * 60_000);
      await service().currentSubscription("a");
      expect((await subscriptionsOf())[0].status).toBe("FAILED");
      expect(sub.id).toBe((await subscriptionsOf())[0].id);
    });
  });

  describe("cancelSubscription", () => {
    async function activeSubscription() {
      const sub = await subscribe();
      await service().handleWebhookEvent(paid(sub.id));
      await service().handleWebhookEvent(activated(sub.id));
      return sub;
    }

    it("cancels through the provider and shows CANCELING at once", async () => {
      const sub = await activeSubscription();
      await expect(service().cancelSubscription("a")).resolves.toEqual({
        status: "CANCELING",
        currentPeriodEnd: new Date("2026-11-05T00:00:00Z"),
      });
      const [row] = await subscriptionsOf();
      expect(row).toMatchObject({ id: sub.id, status: "CANCELING" });
      expect(row.statusUpdatedAt).toEqual(now);
      // A renewal event from before the cancellation arrives late.
      await service().handleWebhookEvent(
        changed(sub.id, "ACTIVE", "2026-10-05T11:59:00Z", "2026-11-05"),
      );
      expect((await subscriptionsOf())[0].status).toBe("CANCELING");
    });

    it("keeps a newer webhook status when the cancel response arrives late", async () => {
      const sub = await activeSubscription();
      let entered!: () => void;
      const called = new Promise<void>((resolve) => (entered = resolve));
      let answer!: (value: { status: "CANCELING" }) => void;
      const slow = {
        ...createFakePaymentProvider(),
        cancelSubscription: () => {
          entered();
          return new Promise<{ status: "CANCELING" }>((r) => (answer = r));
        },
      };
      const cancellation = service(slow).cancelSubscription("a");
      await called;
      // While Waffo answers, the subscription ends (e.g. the period ran out).
      await service().handleWebhookEvent(
        changed(sub.id, "CANCELED", "2026-10-05T12:00:30Z"),
      );
      answer({ status: "CANCELING" });
      await expect(cancellation).resolves.toMatchObject({ status: "CANCELED" });
      expect((await subscriptionsOf())[0].status).toBe("CANCELED");
      expect(await service().currentSubscription("a")).toBeNull();
    });

    it("does not call the provider again for a canceling subscription", async () => {
      await activeSubscription();
      await service().cancelSubscription("a");
      await expect(
        service(
          createFakePaymentProvider({ failCancel: true }),
        ).cancelSubscription("a"),
      ).resolves.toMatchObject({ status: "CANCELING" });
    });

    it("cancels a past-due subscription", async () => {
      const sub = await activeSubscription();
      await service().handleWebhookEvent(
        changed(sub.id, "PAST_DUE", "2026-10-05T12:30:00Z"),
      );
      now = new Date("2026-10-05T13:00:00Z");
      await expect(service().cancelSubscription("a")).resolves.toMatchObject({
        status: "CANCELING",
      });
    });

    it("returns SUBSCRIPTION_NOT_FOUND without a paid, cancelable subscription", async () => {
      await expect(service().cancelSubscription("a")).rejects.toMatchObject({
        code: "SUBSCRIPTION_NOT_FOUND",
      });
      await subscribe();
      await expect(service().cancelSubscription("a")).rejects.toMatchObject({
        code: "SUBSCRIPTION_NOT_FOUND",
      });
      await activeSubscription();
      await expect(service().cancelSubscription("b")).rejects.toMatchObject({
        code: "SUBSCRIPTION_NOT_FOUND",
      });
    });

    it("keeps the status and returns PAYMENT_ERROR when the provider fails", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      await activeSubscription();
      await expect(
        service(
          createFakePaymentProvider({ failCancel: true }),
        ).cancelSubscription("a"),
      ).rejects.toMatchObject({ code: "PAYMENT_ERROR" });
      expect((await subscriptionsOf()).at(-1)?.status).toBe("ACTIVE");
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('"eventType":"billing.cancel_failed"'),
      );
      vi.restoreAllMocks();
    });
  });

  describe("refunds", () => {
    const refunded = (
      subscriptionId: string,
      refundedAmountUsdCents?: number,
      paymentId = "fake_pay_1",
    ): PaymentWebhookEvent => ({
      type: "subscription.payment_refunded",
      eventId: `refund-${paymentId}-${refundedAmountUsdCents}`,
      subscriptionId,
      providerOrderId: "fake_sub_ord_1",
      providerPaymentId: paymentId,
      refundedAmountUsdCents,
      paidAmountUsdCents: 990,
      rawEventType: "refund.succeeded",
      payload: {},
    });
    async function paidActive() {
      const sub = await subscribe();
      await service().handleWebhookEvent(paid(sub.id));
      await service().handleWebhookEvent(activated(sub.id));
      return sub;
    }

    it("reverses the refunded period and keeps the subscription status", async () => {
      const sub = await paidActive();
      await service().handleWebhookEvent(paid(sub.id, "fake_pay_2"));
      await service().handleWebhookEvent(
        refunded(sub.id, undefined, "fake_pay_2"),
      );
      expect(await balance()).toBe(60);
      expect((await subscriptionsOf())[0].status).toBe("ACTIVE");
    });

    it("reverses a partial refund in proportion, rounded up", async () => {
      const sub = await paidActive();
      await service().handleWebhookEvent(refunded(sub.id, 495));
      expect(await balance()).toBe(30);
      await service().handleWebhookEvent(refunded(sub.id, 495));
      expect(await balance()).toBe(30);
    });

    it("reverses down to zero and reports the shortfall", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const sub = await paidActive();
      await createCreditService(db).adminAdjust(
        "a",
        -50,
        "33333333-3333-4333-8333-333333333333",
        "spent",
      );
      await service().handleWebhookEvent(refunded(sub.id));
      expect(await balance()).toBe(0);
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('"eventType":"billing.refund_shortfall"'),
      );
      vi.restoreAllMocks();
    });

    // Known gap (docs/architecture/data-model.md#creditservice): a zero reversal leaves
    // no ledger row, so a second refund event id for the same payment can take a later top-up.
    it.todo(
      "a refund of the same payment under a new event id after a zero reversal takes nothing",
    );

    it("fails, so Waffo retries, when the refund arrives before its payment", async () => {
      const sub = await subscribe();
      await expect(
        service().handleWebhookEvent(refunded(sub.id)),
      ).rejects.toBeDefined();
      const [inbox] = await db.select().from(paymentEvents);
      expect(inbox.processedAt).toBeNull();
    });
  });
});
