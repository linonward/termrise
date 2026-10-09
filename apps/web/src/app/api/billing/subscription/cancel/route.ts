import { getBillingService } from "@/server/billing/billing";
import { userRoute } from "@/server/http/user-route";

// In-app cancellation: docs/architecture/billing.md#cancel-subscription.
export const POST = userRoute(
  { rateLimit: { limit: "checkout", key: "subscription-cancel" } },
  async ({ user }) => {
    const { status, currentPeriodEnd } =
      await getBillingService().cancelSubscription(user.id);
    return Response.json({
      status,
      currentPeriodEnd: currentPeriodEnd?.toISOString() ?? null,
    });
  },
);
