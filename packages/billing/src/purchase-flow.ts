import { and, desc, eq, isNull, lt } from "drizzle-orm";
import { z } from "zod";

import { createCreditService } from "@repo/credits/credit-service";
import { purchases } from "@repo/db/schema";
import { AppError } from "@repo/observability/errors";
import { logger } from "@repo/observability/logger";

import { CREDIT_PACKS, type CreditPackId } from "./credit-packs";
import {
  PENDING_EXPIRY_MS,
  refundCredits,
  type FlowDeps,
  type Transaction,
} from "./flow";
import type { PaymentWebhookEvent } from "./types";

type Purchase = typeof purchases.$inferSelect;
type PurchaseEvent = Extract<
  PaymentWebhookEvent,
  { type: "payment.succeeded" | "payment.refunded" }
>;

// One-time Credit Packs: docs/architecture/billing.md#waffo-payment-flow.
export function createPurchaseFlow(
  deps: FlowDeps & {
    /** Absolute URL the checkout returns to after payment. */
    successUrl: string;
  },
) {
  const { database, provider, now } = deps;

  async function checkout(
    user: { id: string; email: string },
    packId: CreditPackId,
  ) {
    const pack = CREDIT_PACKS[packId];
    const [purchase] = await database
      .insert(purchases)
      .values({
        userId: user.id,
        provider: provider.name,
        packId,
        amountUsd: pack.priceUsd,
        credits: pack.credits,
        status: "PENDING",
        createdAt: now(),
      })
      .returning();
    let result;
    try {
      result = await provider.createCheckout({
        purchaseId: purchase.id,
        userId: user.id,
        email: user.email,
        packId,
        amountUsdCents: pack.priceUsd,
        successUrl: deps.successUrl,
      });
    } catch (error) {
      await database
        .update(purchases)
        .set({ status: "FAILED" })
        .where(eq(purchases.id, purchase.id));
      logger.error("billing.checkout_failed", {
        purchaseId: purchase.id,
        error,
      });
      throw new AppError("PAYMENT_ERROR", "Checkout creation failed");
    }
    await database
      .update(purchases)
      .set({ providerSessionId: result.providerSessionId })
      .where(eq(purchases.id, purchase.id));
    return { checkoutUrl: result.checkoutUrl };
  }

  /** Returns the purchase only on its PENDING → PAID transition. */
  async function apply(
    tx: Transaction,
    event: PurchaseEvent,
  ): Promise<Purchase | undefined> {
    const context = { purchaseId: event.purchaseId, eventId: event.eventId };
    if (!z.uuid().safeParse(event.purchaseId).success) {
      logger.warn("billing.unknown_purchase", context);
      return;
    }
    // Lock order: the purchase first; CreditService then locks the user's balance.
    const [purchase] = await tx
      .select()
      .from(purchases)
      .where(
        and(
          eq(purchases.id, event.purchaseId),
          eq(purchases.provider, provider.name),
        ),
      )
      .for("no key update");
    if (!purchase) {
      logger.warn("billing.unknown_purchase", context);
      return;
    }
    if (event.type === "payment.succeeded") {
      // The provider took the money: a payment after our 60-minute expiry still
      // moves FAILED to PAID (docs/architecture/billing.md#pending-expiry).
      const late = purchase.status === "FAILED";
      if (late) logger.warn("billing.late_payment", context);
      const pending = purchase.status === "PENDING" || late;
      if (pending)
        await tx
          .update(purchases)
          .set({
            status: "PAID",
            completedAt: now(),
            providerOrderId: event.providerOrderId,
            providerPaymentId: event.providerPaymentId,
          })
          .where(eq(purchases.id, purchase.id));
      else if (purchase.status !== "PAID") {
        // A payment for a REFUNDED purchase needs manual handling.
        logger.error("billing.payment_for_non_pending_purchase", {
          ...context,
          status: purchase.status,
        });
        return;
      }
      await createCreditService(tx).grant({
        userId: purchase.userId,
        purchaseId: purchase.id,
        type: "PURCHASE",
        amount: purchase.credits,
        idempotencyKey: `purchase:${purchase.id}:credit`,
      });
      return pending ? purchase : undefined;
    }
    // The payment event is late or lost. Fail so the inbox keeps the refund
    // unprocessed and Waffo retries it after the payment arrives.
    if (purchase.status !== "PAID" && purchase.status !== "REFUNDED")
      throw new Error(`Refund for a ${purchase.status} purchase`);
    const shortfall = await reverse(
      tx,
      purchase,
      refundCredits(
        purchase.credits,
        event.refundedAmountUsdCents,
        event.paidAmountUsdCents ?? purchase.amountUsd,
      ),
    );
    if (shortfall > 0)
      logger.error("billing.refund_shortfall", {
        ...context,
        shortfall,
      });
  }

  // PAID → REFUNDED and the reversal in one step. REFUNDED marks a finished
  // refund, also one that took nothing because the balance was empty.
  async function reverse(tx: Transaction, purchase: Purchase, target: number) {
    const credits = createCreditService(tx);
    const key = `purchase:${purchase.id}:reversal`;
    if (purchase.status === "REFUNDED") {
      const previous = await credits.findEntry(key);
      return target + (previous?.amount ?? 0);
    }
    if (!(await credits.findEntry(`purchase:${purchase.id}:credit`)))
      throw new Error("Refund for a purchase without its grant");
    await tx
      .update(purchases)
      .set({ status: "REFUNDED", refundedAt: now() })
      .where(eq(purchases.id, purchase.id));
    const { shortfall } = await credits.reverse({
      userId: purchase.userId,
      purchaseId: purchase.id,
      type: "PURCHASE_REVERSAL",
      credits: target,
      idempotencyKey: key,
    });
    return shortfall;
  }

  /** The user's purchases, newest first; expires unpaid checkouts first. */
  async function list(userId: string) {
    await database
      .update(purchases)
      .set({ status: "FAILED" })
      .where(
        and(
          eq(purchases.userId, userId),
          eq(purchases.status, "PENDING"),
          isNull(purchases.providerOrderId),
          lt(
            purchases.createdAt,
            new Date(now().getTime() - PENDING_EXPIRY_MS),
          ),
        ),
      );
    return database
      .select()
      .from(purchases)
      .where(eq(purchases.userId, userId))
      .orderBy(desc(purchases.createdAt));
  }

  return { checkout, apply, list };
}
