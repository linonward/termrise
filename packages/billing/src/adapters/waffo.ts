import { verifyWebhook, WaffoPancake } from "@waffo/pancake-ts";

import type { CreditPackId } from "../credit-packs";
import type { SubscriptionPlanId } from "../subscription-plans";
import {
  PaymentSignatureError,
  type PaymentProvider,
  type PaymentWebhookEvent,
} from "../types";

// One Waffo one-time product per pack. Empty until `pnpm waffo:products --apply`
// creates them in the test store and prints the ids; publishing to production keeps
// the same ids. Prices live in Waffo and must match CREDIT_PACKS.
export const WAFFO_PRODUCT_IDS: Record<CreditPackId, string> = {
  single: "",
  starter: "",
  creator: "",
  pro: "",
};

// One Waffo subscription product per plan, filled in the same way.
export const WAFFO_SUBSCRIPTION_PRODUCT_IDS: Record<
  SubscriptionPlanId,
  string
> = { monthly: "" };

const EVENT_TYPES = {
  "order.completed": "payment.succeeded",
  "refund.succeeded": "payment.refunded",
  "subscription.payment_succeeded": "subscription.payment_succeeded",
  "subscription.activated": "subscription.status_changed",
  "subscription.renewed": "subscription.status_changed",
  "subscription.recovered": "subscription.status_changed",
  "subscription.past_due": "subscription.status_changed",
  "subscription.canceling": "subscription.status_changed",
  "subscription.uncanceled": "subscription.status_changed",
  "subscription.canceled": "subscription.status_changed",
} as const;

// Status events carry the order's status (docs/payment-provider-spike.md#subscription-spike).
// expired is terminal like canceled; anything else (e.g. closed) is not ours to track.
const ORDER_STATUSES = {
  active: "ACTIVE",
  past_due: "PAST_DUE",
  canceling: "CANCELING",
  canceled: "CANCELED",
  expired: "CANCELED",
} as const;

type WaffoEventData = {
  orderId: string;
  paymentId?: string;
  orderMerchantExternalId?: string;
  orderMetadata?: Record<string, string>;
  refundedAmount?: string;
  // What the refunded payment collected. Not originalPayment.total: that is the
  // list price, and differs after a discount (SDK docs/webhook-guide.md).
  originalChargedAmount?: string;
  orderStatus?: string;
  currentPeriodEnd?: string;
};

// Waffo amounts are display strings such as "4.50".
const toCents = (amount?: string) =>
  amount && /^\d+(\.\d{1,2})?$/.test(amount)
    ? Math.round(Number(amount) * 100)
    : undefined;

// Contract and field mapping: docs/payment-provider-spike.md.
export function createWaffoPaymentProvider(deps: {
  merchantId: string;
  privateKey: string;
  /** test or prod: must match the API key's environment. */
  environment: "test" | "prod";
  /** Tests only; production uses the platform key built into the SDK. */
  webhookPublicKey?: string;
  fetch?: typeof fetch;
}): PaymentProvider {
  const client = new WaffoPancake({
    merchantId: deps.merchantId,
    privateKey: deps.privateKey,
    fetch: deps.fetch,
  });
  return {
    name: "waffo",
    // One sign-in page for every store, by purchase email; no sign-in-free link API.
    customerPortalUrl: "https://pancake.waffo.ai/consumer/portal/login",
    async createCheckout({ purchaseId, userId, email, packId, successUrl }) {
      const session = await client.checkout.createSession(
        {
          productId: WAFFO_PRODUCT_IDS[packId],
          currency: "USD",
          buyerEmail: email,
          successUrl,
          orderMerchantExternalId: purchaseId,
          metadata: { purchaseId, userId },
        },
        // Waffo keys allow only letters, digits, "-" and "_".
        { idempotencyKey: `${deps.merchantId}-checkout-${purchaseId}` },
      );
      return {
        checkoutUrl: session.checkoutUrl,
        providerSessionId: session.sessionId,
      };
    },
    // Same create-session call as a pack; the subscription product makes it recurring.
    async createSubscriptionCheckout({
      subscriptionId,
      userId,
      email,
      planId,
      successUrl,
    }) {
      const session = await client.checkout.createSession(
        {
          productId: WAFFO_SUBSCRIPTION_PRODUCT_IDS[planId],
          currency: "USD",
          buyerEmail: email,
          successUrl,
          orderMerchantExternalId: subscriptionId,
          metadata: { subscriptionId, userId },
        },
        { idempotencyKey: `${deps.merchantId}-subscription-${subscriptionId}` },
      );
      return {
        checkoutUrl: session.checkoutUrl,
        providerSessionId: session.sessionId,
      };
    },
    // docs/payment-provider-spike.md#subscription-spike: active → canceling at the period end.
    async cancelSubscription({ providerOrderId }) {
      const { status } = await client.orders.cancelSubscription({
        orderId: providerOrderId,
      });
      if (status === "canceling") return { status: "CANCELING" };
      if (status === "canceled") return { status: "CANCELED" };
      throw new Error(`Unexpected subscription status after cancel: ${status}`);
    },
    async verifyWebhook(request) {
      const raw = await request.text();
      let event;
      try {
        event = verifyWebhook<WaffoEventData>(
          raw,
          request.headers.get("x-waffo-signature"),
          {
            environment: deps.environment,
            publicKey: deps.webhookPublicKey,
          },
        );
      } catch {
        throw new PaymentSignatureError();
      }
      if (event.mode !== deps.environment) throw new PaymentSignatureError();
      const type =
        EVENT_TYPES[event.eventType as keyof typeof EVENT_TYPES] ?? null;
      if (!type) return null;
      const { data } = event;
      // A refund of a subscription payment: our checkout metadata names the subscription.
      if (type === "payment.refunded" && data.orderMetadata?.subscriptionId)
        return {
          type: "subscription.payment_refunded",
          eventId: `${event.eventType}:${event.eventId}`,
          subscriptionId:
            data.orderMerchantExternalId ?? data.orderMetadata.subscriptionId,
          providerOrderId: data.orderId,
          providerPaymentId: data.paymentId ?? "",
          refundedAmountUsdCents: toCents(data.refundedAmount),
          paidAmountUsdCents: toCents(data.originalChargedAmount),
          rawEventType: event.eventType,
          payload: event,
        };
      if (
        type === "subscription.payment_succeeded" ||
        type === "subscription.status_changed"
      ) {
        const status =
          ORDER_STATUSES[data.orderStatus as keyof typeof ORDER_STATUSES];
        if (type === "subscription.status_changed" && !status) return null;
        return {
          type,
          eventId: `${event.eventType}:${event.eventId}`,
          subscriptionId:
            data.orderMerchantExternalId ??
            data.orderMetadata?.subscriptionId ??
            "",
          providerOrderId: data.orderId,
          ...(type === "subscription.payment_succeeded"
            ? { providerPaymentId: data.paymentId ?? "" }
            : {
                status,
                occurredAt: event.timestamp,
                currentPeriodEnd: data.currentPeriodEnd,
              }),
          rawEventType: event.eventType,
          payload: event,
        } as PaymentWebhookEvent;
      }
      return {
        type,
        // Waffo ids are unique per event type (PAY_… / REF_…), not globally.
        eventId: `${event.eventType}:${event.eventId}`,
        purchaseId:
          data.orderMerchantExternalId ?? data.orderMetadata?.purchaseId ?? "",
        providerOrderId: data.orderId,
        ...(type === "payment.succeeded"
          ? { providerPaymentId: data.paymentId }
          : {
              refundedAmountUsdCents: toCents(data.refundedAmount),
              paidAmountUsdCents: toCents(data.originalChargedAmount),
            }),
        rawEventType: event.eventType,
        payload: event,
      } as PaymentWebhookEvent;
    },
  };
}
