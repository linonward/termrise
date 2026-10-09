import { randomUUID } from "node:crypto";

import {
  PaymentSignatureError,
  type PaymentProvider,
  type PaymentWebhookEvent,
} from "../types";

// For automated tests and Preview E2E only (env.ts forbids it in production).
// Checkout "redirects" straight to the success url; nothing is paid, so no credits are
// granted until a signed fake webhook arrives.
const SIGNATURE_HEADER = "x-fake-signature";
const SIGNATURE = "fake-payment-signature";
const TYPES = [
  "payment.succeeded",
  "payment.refunded",
  "subscription.payment_succeeded",
  "subscription.status_changed",
  "subscription.payment_refunded",
] as const;

type FakeEvent = {
  type: string;
  eventId: string;
  purchaseId?: string;
  subscriptionId?: string;
  providerOrderId: string;
  providerPaymentId?: string;
  refundedAmountUsdCents?: number;
  status?: string;
  occurredAt?: string;
  currentPeriodEnd?: string;
  paidAmountUsdCents?: number;
};

export function fakeWebhookRequest(
  event: FakeEvent,
  { signature = SIGNATURE, url = "http://localhost/fake-webhook" } = {},
) {
  return new Request(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      [SIGNATURE_HEADER]: signature,
    },
    body: JSON.stringify(event),
  });
}

/** Customer portal of the fake provider; tests check the Billing page links to it. */
export const FAKE_CUSTOMER_PORTAL_URL =
  "https://example.com/fake-customer-portal";

export function createFakePaymentProvider(
  deps: { failCheckout?: boolean; failCancel?: boolean } = {},
): PaymentProvider {
  return {
    name: "fake",
    customerPortalUrl: FAKE_CUSTOMER_PORTAL_URL,
    async createCheckout({ successUrl }) {
      if (deps.failCheckout) throw new Error("Fake checkout error");
      return {
        checkoutUrl: successUrl,
        providerSessionId: `fake_cs_${randomUUID()}`,
      };
    },
    async createSubscriptionCheckout({ successUrl }) {
      if (deps.failCheckout) throw new Error("Fake checkout error");
      return {
        checkoutUrl: successUrl,
        providerSessionId: `fake_cs_${randomUUID()}`,
      };
    },
    async cancelSubscription() {
      if (deps.failCancel) throw new Error("Fake cancel error");
      return { status: "CANCELING" };
    },
    async verifyWebhook(request) {
      if (request.headers.get(SIGNATURE_HEADER) !== SIGNATURE)
        throw new PaymentSignatureError();
      const event = (await request.json()) as FakeEvent;
      const type = TYPES.find((t) => t === event.type);
      if (!type) return null;
      return {
        ...event,
        type,
        rawEventType: event.type,
        payload: event,
      } as PaymentWebhookEvent;
    },
  };
}
