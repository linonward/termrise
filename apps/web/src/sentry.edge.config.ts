import * as Sentry from "@sentry/nextjs";

import { scrubSentryEvent } from "@repo/observability/scrub-query-params";

Sentry.init({
  beforeSend: scrubSentryEvent,
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
});
