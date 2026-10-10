import type { Context } from "hono";

import { createPostHogAnalyticsProvider } from "@repo/analytics/adapters/posthog-node";
import { createAnalyticsService } from "@repo/analytics/analytics-service";

import { apiEnv, type AppEnv } from "./env";
import product from "../../../product.config";

/** Server analytics for this request. Without POSTHOG_KEY, events are dropped; consent is still stored. */
export function requestAnalytics(c: Context<AppEnv>) {
  const env = apiEnv(c.env);
  return createAnalyticsService({
    database: c.var.db,
    provider: env.POSTHOG_KEY
      ? createPostHogAnalyticsProvider({
          key: env.POSTHOG_KEY,
          host: env.POSTHOG_HOST,
        })
      : { capture: async () => {} },
    productId: product.id,
    defer: c.var.defer,
  });
}
