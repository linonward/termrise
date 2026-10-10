import type { Context } from "hono";

import { createFakePaymentProvider } from "@repo/billing/adapters/fake";
import { createWaffoPaymentProvider } from "@repo/billing/adapters/waffo";
import { createBillingService } from "@repo/billing/billing-service";
import type { PaymentProvider } from "@repo/billing/types";

import { requestAnalytics } from "./analytics";
import { apiEnv, type ApiEnv, type AppEnv } from "./env";

export function apiPaymentProvider(env: ApiEnv): PaymentProvider {
  // env.ts requires the WAFFO_* keys when PAYMENT_PROVIDER=waffo.
  return env.PAYMENT_PROVIDER === "waffo"
    ? createWaffoPaymentProvider({
        merchantId: env.WAFFO_MERCHANT_ID!,
        privateKey: env.WAFFO_PRIVATE_KEY!,
        environment: env.WAFFO_ENVIRONMENT,
      })
    : createFakePaymentProvider();
}

/** BillingService on this request's connection; checkout returns to the web app's /billing. */
export function requestBilling(c: Context<AppEnv>) {
  const env = apiEnv(c.env);
  return createBillingService({
    database: c.var.db,
    provider: apiPaymentProvider(env),
    successUrl: `${env.APP_URL}/billing?checkout=success`,
    subscriptionSuccessUrl: `${env.APP_URL}/billing?checkout=subscription`,
    analytics: requestAnalytics(c),
  });
}
