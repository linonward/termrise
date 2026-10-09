import {
  and,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lt,
  ne,
  sql,
} from "drizzle-orm";
import { z } from "zod";

import { createCreditService } from "@repo/credits/credit-service";
import { creditTransactions, subscriptions } from "@repo/db/schema";
import { AppError } from "@repo/observability/errors";
import { logger } from "@repo/observability/logger";

import {
  PENDING_EXPIRY_MS,
  refundCredits,
  type FlowDeps,
  type Transaction,
} from "./flow";
import {
  SUBSCRIPTION_PLANS,
  type SubscriptionPlanId,
} from "./subscription-plans";
import type { PaymentWebhookEvent } from "./types";

type SubscriptionEvent = Extract<
  PaymentWebhookEvent,
  {
    type:
      | "subscription.payment_succeeded"
      | "subscription.status_changed"
      | "subscription.payment_refunded";
  }
>;

// Subscriptions: docs/adr/009-subscription.md, docs/architecture/billing.md#subscriptions.
export function createSubscriptionFlow(
  deps: FlowDeps & {
    /** Absolute URL a subscription checkout returns to after payment. */
    successUrl: string;
  },
) {
  const { database, provider, now } = deps;

  // One paid subscription per user (docs/adr/009-subscription.md). An unpaid checkout
  // never blocks: a new one replaces it, so closing the Waffo page and retrying works.
  async function checkout(
    user: { id: string; email: string },
    planId: SubscriptionPlanId,
  ) {
    const plan = SUBSCRIPTION_PLANS[planId];
    const subscription = await database.transaction(async (tx) => {
      // Serialises concurrent checkouts of one user without touching the balance row.
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`subscription-checkout:${user.id}`}, 0))`,
      );
      const [paid] = await tx
        .select({ id: subscriptions.id })
        .from(subscriptions)
        .where(
          and(
            eq(subscriptions.userId, user.id),
            isNotNull(subscriptions.providerOrderId),
            ne(subscriptions.status, "CANCELED"),
          ),
        );
      if (paid) throw new AppError("SUBSCRIPTION_EXISTS", "Already subscribed");
      await tx
        .update(subscriptions)
        .set({ status: "FAILED" })
        .where(
          and(
            eq(subscriptions.userId, user.id),
            eq(subscriptions.status, "PENDING"),
            isNull(subscriptions.providerOrderId),
          ),
        );
      const [row] = await tx
        .insert(subscriptions)
        .values({
          userId: user.id,
          provider: provider.name,
          planId,
          amountUsd: plan.priceUsd,
          credits: plan.credits,
          status: "PENDING",
          createdAt: now(),
        })
        .returning();
      return row;
    });
    let result;
    try {
      result = await provider.createSubscriptionCheckout({
        subscriptionId: subscription.id,
        userId: user.id,
        email: user.email,
        planId,
        successUrl: deps.successUrl,
      });
    } catch (error) {
      await database
        .update(subscriptions)
        .set({ status: "FAILED" })
        .where(eq(subscriptions.id, subscription.id));
      logger.error("billing.checkout_failed", {
        subscriptionId: subscription.id,
        error,
      });
      throw new AppError("PAYMENT_ERROR", "Checkout creation failed");
    }
    await database
      .update(subscriptions)
      .set({ providerSessionId: result.providerSessionId })
      .where(eq(subscriptions.id, subscription.id));
    return { checkoutUrl: result.checkoutUrl };
  }

  // Payments and status events arrive in any order (docs/payment-provider-spike.md#subscription-spike):
  // a payment grants without waiting for activation; a status event applies only when it
  // is newer than the last one applied.
  async function apply(tx: Transaction, event: SubscriptionEvent) {
    const context = {
      subscriptionId: event.subscriptionId,
      eventId: event.eventId,
    };
    if (!z.uuid().safeParse(event.subscriptionId).success) {
      logger.warn("billing.unknown_subscription", context);
      return;
    }
    // Lock order: the subscription first; CreditService then locks the user's balance.
    const [subscription] = await tx
      .select()
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.id, event.subscriptionId),
          eq(subscriptions.provider, provider.name),
        ),
      )
      .for("no key update");
    if (!subscription) {
      logger.warn("billing.unknown_subscription", context);
      return;
    }
    const credits = createCreditService(tx);
    // The refund reverses that payment's grant only; the subscription status is untouched.
    if (event.type === "subscription.payment_refunded") {
      const paymentKey = `subscription-payment:${event.providerPaymentId}`;
      const grant = await credits.findEntry(`${paymentKey}:credit`);
      // A refund before its payment event fails, so the provider retries it.
      if (!grant || grant.subscriptionId !== subscription.id)
        throw new Error("Refund for a subscription payment without its grant");
      const { shortfall } = await credits.reverse({
        userId: subscription.userId,
        subscriptionId: subscription.id,
        type: "SUBSCRIPTION_REVERSAL",
        credits: refundCredits(
          grant.amount,
          event.refundedAmountUsdCents,
          event.paidAmountUsdCents ?? subscription.amountUsd,
        ),
        idempotencyKey: `${paymentKey}:reversal`,
      });
      if (shortfall > 0)
        logger.error("billing.refund_shortfall", { ...context, shortfall });
      return;
    }
    // A replaced or expired checkout that was paid anyway can leave the user with two subscriptions.
    if (subscription.status === "FAILED")
      logger.error("billing.replaced_subscription_paid", context);
    const occurredAt =
      event.type === "subscription.status_changed"
        ? new Date(event.occurredAt)
        : undefined;
    const newer =
      occurredAt !== undefined &&
      !Number.isNaN(occurredAt.getTime()) &&
      (!subscription.statusUpdatedAt ||
        occurredAt > subscription.statusUpdatedAt);
    const periodEnd =
      event.type === "subscription.status_changed" && event.currentPeriodEnd
        ? new Date(event.currentPeriodEnd)
        : undefined;
    await tx
      .update(subscriptions)
      .set({
        providerOrderId: event.providerOrderId,
        ...(newer &&
          event.type === "subscription.status_changed" && {
            status: event.status,
            statusUpdatedAt: occurredAt,
            ...(periodEnd &&
              !Number.isNaN(periodEnd.getTime()) && {
                currentPeriodEnd: periodEnd,
              }),
          }),
      })
      .where(eq(subscriptions.id, subscription.id));
    // One grant per payment (first charge or renewal), sized by the checkout snapshot.
    if (event.type === "subscription.payment_succeeded") {
      if (!event.providerPaymentId)
        throw new Error("Subscription payment without a payment id");
      await credits.grant({
        userId: subscription.userId,
        subscriptionId: subscription.id,
        type: "SUBSCRIPTION_GRANT",
        amount: subscription.credits,
        idempotencyKey: `subscription-payment:${event.providerPaymentId}:credit`,
      });
    }
  }

  /** The paid, not canceled subscription for the Billing page; expires unpaid checkouts first. */
  async function current(userId: string) {
    await database
      .update(subscriptions)
      .set({ status: "FAILED" })
      .where(
        and(
          eq(subscriptions.userId, userId),
          eq(subscriptions.status, "PENDING"),
          isNull(subscriptions.providerOrderId),
          lt(
            subscriptions.createdAt,
            new Date(now().getTime() - PENDING_EXPIRY_MS),
          ),
        ),
      );
    const [row] = await database
      .select({
        id: subscriptions.id,
        planId: subscriptions.planId,
        status: subscriptions.status,
        currentPeriodEnd: subscriptions.currentPeriodEnd,
      })
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.userId, userId),
          isNotNull(subscriptions.providerOrderId),
          ne(subscriptions.status, "CANCELED"),
        ),
      )
      .orderBy(desc(subscriptions.createdAt))
      .limit(1);
    return row ?? null;
  }

  // In-app cancellation (docs/adr/009-subscription.md). The provider's answer sets the
  // status now, stamped with our time, so an older event that arrives later cannot undo it.
  // Only activated subscriptions: a paid PENDING one waits for `activated` (seconds), and
  // the Billing page hides the button meanwhile. Waffo canceling before activation is untested.
  async function cancel(userId: string) {
    const [subscription] = await database
      .select()
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.userId, userId),
          isNotNull(subscriptions.providerOrderId),
          inArray(subscriptions.status, ["ACTIVE", "PAST_DUE", "CANCELING"]),
        ),
      )
      .orderBy(desc(subscriptions.createdAt))
      .limit(1);
    if (!subscription)
      throw new AppError("SUBSCRIPTION_NOT_FOUND", "No subscription to cancel");
    const result = {
      status: subscription.status,
      currentPeriodEnd: subscription.currentPeriodEnd,
    };
    if (subscription.status === "CANCELING") return result;
    let canceled;
    try {
      canceled = await provider.cancelSubscription({
        providerOrderId: subscription.providerOrderId!,
      });
    } catch (error) {
      logger.error("billing.cancel_failed", {
        subscriptionId: subscription.id,
        error,
      });
      throw new AppError("PAYMENT_ERROR", "Subscription cancel failed");
    }
    // Only if no webhook changed the status while Waffo answered: a late answer
    // must not turn a CANCELED subscription back into CANCELING.
    const [updated] = await database
      .update(subscriptions)
      .set({ status: canceled.status, statusUpdatedAt: now() })
      .where(
        and(
          eq(subscriptions.id, subscription.id),
          eq(subscriptions.status, subscription.status),
        ),
      )
      .returning({ status: subscriptions.status });
    if (updated) return { ...result, status: updated.status };
    const [latest] = await database
      .select({
        status: subscriptions.status,
        currentPeriodEnd: subscriptions.currentPeriodEnd,
      })
      .from(subscriptions)
      .where(eq(subscriptions.id, subscription.id));
    return latest!;
  }

  /** For the post-checkout banner: null without any subscription checkout. */
  async function checkoutStatus(userId: string) {
    const [newest] = await database
      .select({ id: subscriptions.id })
      .from(subscriptions)
      .where(eq(subscriptions.userId, userId))
      .orderBy(desc(subscriptions.createdAt))
      .limit(1);
    if (!newest) return null;
    const [grant] = await database
      .select({ id: creditTransactions.id })
      .from(creditTransactions)
      .where(eq(creditTransactions.subscriptionId, newest.id))
      .limit(1);
    return { granted: Boolean(grant) };
  }

  return { checkout, apply, current, cancel, checkoutStatus };
}
