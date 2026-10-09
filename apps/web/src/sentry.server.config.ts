import * as Sentry from "@sentry/nextjs";

import { setErrorReporter } from "@repo/observability/logger";
import { scrubSentryEvent } from "@repo/observability/scrub-query-params";

Sentry.init({
  beforeSend: scrubSentryEvent,
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
});

// Every logger.error becomes a Sentry event (docs/architecture/observability.md#observability).
setErrorReporter((error, context) => Sentry.captureException(error, context));
