import { toPurchaseDto } from "@repo/billing/purchase-dto";
import { toSubscriptionDto } from "@repo/billing/subscription-dto";
import { toCreditActivityDto } from "@repo/credits/credit-activity";
import { createCreditService } from "@repo/credits/credit-service";

import { apiPaymentProvider, requestBilling } from "../billing";
import { apiEnv } from "../env";
import { userRoutes } from "./user-routes";
import { rateLimit } from "../middleware/rate-limit";

export const billing = userRoutes()
  .get("/purchases", async (c) => {
    const list = await requestBilling(c).listPurchases(c.var.user.id);
    return c.json({ purchases: list.map(toPurchaseDto) });
  })
  .get("/credit-activity", async (c) => {
    const { items, nextCursor } = await createCreditService(
      c.var.db,
    ).listActivity(c.var.user.id, c.req.query("cursor"));
    return c.json({
      transactions: items.map(toCreditActivityDto),
      nextCursor,
    });
  })
  // The current subscription, and where the provider lets the buyer update the card.
  .get("/subscription", async (c) => {
    const current = await requestBilling(c).currentSubscription(c.var.user.id);
    return c.json({
      subscription: current && toSubscriptionDto(current),
      customerPortalUrl: apiPaymentProvider(apiEnv(c.env)).customerPortalUrl,
    });
  })
  // After a subscription checkout: whether the newest subscription granted credits yet.
  .get("/subscription/checkout-status", async (c) =>
    c.json({
      checkout: await requestBilling(c).subscriptionCheckoutStatus(
        c.var.user.id,
      ),
    }),
  )
  // In-app cancellation: docs/architecture/billing.md#cancel-subscription.
  .post(
    "/subscription/cancel",
    rateLimit("checkout", "subscription-cancel"),
    async (c) => {
      const { status, currentPeriodEnd } = await requestBilling(
        c,
      ).cancelSubscription(c.var.user.id);
      return c.json({
        status,
        currentPeriodEnd: currentPeriodEnd?.toISOString() ?? null,
      });
    },
  );
