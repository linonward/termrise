import "server-only";
import { createPostHogAnalyticsProvider } from "@repo/analytics/adapters/posthog-node";
import type { AnalyticsProvider } from "@repo/analytics/types";
import { serverEnv } from "@repo/config/env";

let instance: AnalyticsProvider | undefined;
export function getAnalyticsProvider(): AnalyticsProvider {
  if (!instance) {
    const env = serverEnv();
    instance = env.NEXT_PUBLIC_POSTHOG_KEY
      ? createPostHogAnalyticsProvider({
          key: env.NEXT_PUBLIC_POSTHOG_KEY,
          host: env.NEXT_PUBLIC_POSTHOG_HOST,
        })
      : // No key: drop events. The fake provider keeps every event in memory.
        { capture: async () => {} };
  }
  return instance;
}
