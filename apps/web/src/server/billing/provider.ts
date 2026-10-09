import "server-only";
import { createFakePaymentProvider } from "@repo/billing/adapters/fake";
import { createWaffoPaymentProvider } from "@repo/billing/adapters/waffo";
import type { PaymentProvider } from "@repo/billing/types";
import { serverEnv } from "@repo/config/env";

let instance: PaymentProvider | undefined;
export function getPaymentProvider(): PaymentProvider {
  if (!instance) {
    const env = serverEnv();
    // env.ts guarantees the WAFFO_* variables when PAYMENT_PROVIDER=waffo.
    instance =
      env.PAYMENT_PROVIDER === "waffo"
        ? createWaffoPaymentProvider({
            merchantId: env.WAFFO_MERCHANT_ID!,
            privateKey: env.WAFFO_PRIVATE_KEY!,
            // Production uses the prod API key; every other environment the test key.
            environment: env.VERCEL_ENV === "production" ? "prod" : "test",
          })
        : createFakePaymentProvider();
  }
  return instance;
}
