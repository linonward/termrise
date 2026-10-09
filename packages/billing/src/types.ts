// PaymentProvider port: docs/architecture/billing.md#paymentprovider.
import type { CreditPackId } from "./credit-packs";
import type { SubscriptionPlanId } from "./subscription-plans";

export interface CreateCheckoutInput {
  purchaseId: string;
  userId: string;
  email: string;
  packId: CreditPackId;
  amountUsdCents: number;
  successUrl: string;
}

export interface CreateSubscriptionCheckoutInput {
  subscriptionId: string;
  userId: string;
  email: string;
  planId: SubscriptionPlanId;
  successUrl: string;
}

export interface CreateCheckoutResult {
  checkoutUrl: string;
  providerSessionId: string;
}

export type PaymentWebhookEvent =
  | {
      type: "payment.succeeded";
      eventId: string;
      purchaseId: string;
      providerOrderId: string;
      providerPaymentId?: string;
      rawEventType: string;
      payload: unknown;
    }
  | {
      type: "payment.refunded";
      eventId: string;
      purchaseId: string;
      providerOrderId: string;
      /** Missing means a full refund. */
      refundedAmountUsdCents?: number;
      /** What the provider charged for the payment; missing means the purchase price. */
      paidAmountUsdCents?: number;
      rawEventType: string;
      payload: unknown;
    }
  | {
      /** Every successful subscription charge: the first one and each renewal. */
      type: "subscription.payment_succeeded";
      eventId: string;
      subscriptionId: string;
      providerOrderId: string;
      providerPaymentId: string;
      rawEventType: string;
      payload: unknown;
    }
  | {
      /** A refund of one subscription payment; the subscription itself goes on. */
      type: "subscription.payment_refunded";
      eventId: string;
      subscriptionId: string;
      providerOrderId: string;
      providerPaymentId: string;
      /** Missing means a full refund. */
      refundedAmountUsdCents?: number;
      /** What the provider charged for the payment; missing means the plan price. */
      paidAmountUsdCents?: number;
      rawEventType: string;
      payload: unknown;
    }
  | {
      /** Activation, renewal, past due, recovery, cancellation: the order's new status. */
      type: "subscription.status_changed";
      eventId: string;
      subscriptionId: string;
      providerOrderId: string;
      status: "ACTIVE" | "PAST_DUE" | "CANCELING" | "CANCELED";
      /** Provider event time (ISO 8601); orders events that arrive out of order. */
      occurredAt: string;
      /** ISO 8601 date or time; missing on some events. */
      currentPeriodEnd?: string;
      rawEventType: string;
      payload: unknown;
    };

/** Thrown by verifyWebhook() for a bad signature; the route answers 401. */
export class PaymentSignatureError extends Error {
  constructor() {
    super("Invalid payment webhook signature");
  }
}

export interface PaymentProvider {
  readonly name: string;
  /** Where customers manage their payment method; the Billing page links to it. */
  readonly customerPortalUrl: string;
  createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult>;
  createSubscriptionCheckout(
    input: CreateSubscriptionCheckoutInput,
  ): Promise<CreateCheckoutResult>;
  /** Active: ends at the period end (CANCELING). Past due: ends now. */
  cancelSubscription(input: {
    providerOrderId: string;
  }): Promise<{ status: "CANCELING" | "CANCELED" }>;
  /** Throws PaymentSignatureError when invalid; null for irrelevant events. */
  verifyWebhook(request: Request): Promise<PaymentWebhookEvent | null>;
}
