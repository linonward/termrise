import type { createBillingService } from "./billing-service";

type Subscription = NonNullable<
  Awaited<
    ReturnType<ReturnType<typeof createBillingService>["currentSubscription"]>
  >
>;

// Public shape of the current subscription in API responses: no provider ids.
export function toSubscriptionDto(s: Subscription) {
  return {
    planId: s.planId,
    status: s.status,
    currentPeriodEnd: s.currentPeriodEnd?.toISOString() ?? null,
  };
}

export type SubscriptionDto = ReturnType<typeof toSubscriptionDto>;
