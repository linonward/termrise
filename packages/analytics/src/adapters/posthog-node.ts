import { PostHog } from "posthog-node";

import type { AnalyticsProvider } from "../types";

export function createPostHogAnalyticsProvider(config: {
  key: string;
  host: string;
}): AnalyticsProvider {
  const client = new PostHog(config.key, {
    host: config.host,
    // Server events carry no visitor location.
    disableGeoip: true,
  });
  return {
    // Serverless: send before the function returns instead of batching.
    capture: ({ distinctId, event, properties }) =>
      client.captureImmediate({ distinctId, event, properties }),
  };
}
