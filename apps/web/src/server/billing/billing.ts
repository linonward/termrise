import "server-only";
import { createBillingService } from "@repo/billing/billing-service";
import { serverEnv } from "@repo/config/env";
import { db } from "@repo/db/client";

import { getAnalyticsService } from "@/server/analytics/analytics";

import { getPaymentProvider } from "./provider";

export function getBillingService() {
  return createBillingService({
    database: db(),
    provider: getPaymentProvider(),
    successUrl: `${serverEnv().APP_URL}/billing?checkout=success`,
    subscriptionSuccessUrl: `${serverEnv().APP_URL}/billing?checkout=subscription`,
    analytics: getAnalyticsService(),
  });
}
