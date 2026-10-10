import type { Context } from "hono";

import { createPostHogAnalyticsProvider } from "@repo/analytics/adapters/posthog-node";
import { createAnalyticsService } from "@repo/analytics/analytics-service";

import { apiEnv, type AppEnv } from "./env";
import product from "../../../product.config";

/** Server analytics for this request; undefined (events dropped) without POSTHOG_KEY. */
export function requestAnalytics(c: Context<AppEnv>) {
  const env = apiEnv(c.env);
  if (!env.POSTHOG_KEY) return undefined;
  return createAnalyticsService({
    database: c.var.db,
    provider: createPostHogAnalyticsProvider({
      key: env.POSTHOG_KEY,
      host: env.POSTHOG_HOST,
    }),
    productId: product.id,
    defer: c.var.defer,
  });
}
