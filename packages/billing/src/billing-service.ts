import { and, eq } from "drizzle-orm";
import { z } from "zod";

import {
  noAnalytics,
  type AnalyticsService,
} from "@repo/analytics/analytics-service";
import type { Database } from "@repo/db/client";
import { paymentEvents } from "@repo/db/schema";
import { AppError } from "@repo/observability/errors";

import { CREDIT_PACK_IDS } from "./credit-packs";
import { createPurchaseFlow } from "./purchase-flow";
import { createSubscriptionFlow } from "./subscription-flow";
import { SUBSCRIPTION_PLAN_IDS } from "./subscription-plans";
import type { PaymentProvider, PaymentWebhookEvent } from "./types";

// Unknown fields such as credits or price are stripped: the server prices every pack and plan.
const checkoutSchema = z.union([
  z.object({ packId: z.enum(CREDIT_PACK_IDS) }),
  z.object({ planId: z.enum(SUBSCRIPTION_PLAN_IDS) }),
]);

// Entry point for routes and pages. Credit Packs live in purchase-flow.ts,
// subscriptions in subscription-flow.ts; this file parses input and runs the webhook inbox.
export function createBillingService(deps: {
  database: Database;
  provider: PaymentProvider;
  /** Absolute URL the checkout returns to after payment. */
  successUrl: string;
  /** The same for a subscription checkout. */
  subscriptionSuccessUrl: string;
  now?: () => Date;
  analytics?: AnalyticsService;
}) {
  const { database, provider } = deps;
  const analytics = deps.analytics ?? noAnalytics;
  const now = deps.now ?? (() => new Date());
  const purchases = createPurchaseFlow({
    database,
    provider,
    now,
    successUrl: deps.successUrl,
  });
  const subscriptions = createSubscriptionFlow({
    database,
    provider,
    now,
    successUrl: deps.subscriptionSuccessUrl,
  });

  async function createCheckout(
    user: { id: string; email: string },
    body: unknown,
  ) {
    const parsed = checkoutSchema.safeParse(body);
    if (!parsed.success)
      throw new AppError("INVALID_INPUT", "Invalid packId or planId");
    return "planId" in parsed.data
      ? subscriptions.checkout(user, parsed.data.planId)
      : purchases.checkout(user, parsed.data.packId);
  }

  // Inbox first: a processed event is a no-op; an unprocessed one is retried.
  async function handleWebhookEvent(event: PaymentWebhookEvent) {
    const key = and(
      eq(paymentEvents.provider, provider.name),
      eq(paymentEvents.providerEventId, event.eventId),
    );
    await database
      .insert(paymentEvents)
      .values({
        provider: provider.name,
        providerEventId: event.eventId,
        eventType: event.rawEventType,
        payload: event.payload,
      })
      .onConflictDoNothing();
    const paid = await database.transaction(async (tx) => {
      // Locking the inbox row serialises concurrent deliveries of the same event.
      const [inbox] = await tx
        .select()
        .from(paymentEvents)
        .where(key)
        .for("update");
      if (inbox.processedAt) return undefined;
      const result =
        event.type === "payment.succeeded" || event.type === "payment.refunded"
          ? await purchases.apply(tx, event)
          : await subscriptions.apply(tx, event);
      await tx.update(paymentEvents).set({ processedAt: now() }).where(key);
      return result;
    });
    // After commit, once per purchase: only the PENDING → PAID transition returns it.
    if (paid)
      await analytics.capture(paid.userId, "purchase_completed", {
        purchaseId: paid.id,
        packId: paid.packId,
        credits: paid.credits,
        amountUsdCents: paid.amountUsd,
      });
  }

  return {
    /** The provider's page for updating the payment method. */
    customerPortalUrl: provider.customerPortalUrl,
    createCheckout,
    handleWebhookEvent,
    listPurchases: purchases.list,
    currentSubscription: subscriptions.current,
    cancelSubscription: subscriptions.cancel,
    subscriptionCheckoutStatus: subscriptions.checkoutStatus,
  };
}
