import * as Sentry from "@sentry/nextjs";

import { initAnalytics } from "@repo/analytics/client";

import product from "@product";

// No Replay / Feedback: recordings would capture prompts and emails.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
});

initAnalytics(process.env.NEXT_PUBLIC_POSTHOG_KEY, { productId: product.id });

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
