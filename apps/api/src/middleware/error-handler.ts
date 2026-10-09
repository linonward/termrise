import type { ErrorHandler } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import { AppError, ERROR_STATUS, errorBody } from "@repo/observability/errors";
import { logger } from "@repo/observability/logger";

// Same error contract as the web app (docs/architecture/api.md#error-contract):
// known errors keep their code; anything else becomes INTERNAL_ERROR without details.
export const errorHandler: ErrorHandler = (error, c) => {
  if (error instanceof AppError) {
    if (error.retryAfterSeconds)
      c.header("Retry-After", String(error.retryAfterSeconds));
    return c.json(
      errorBody(error.code, error.details),
      ERROR_STATUS[error.code] as ContentfulStatusCode,
    );
  }
  logger.error("http.unhandled_error", { error });
  return c.json(errorBody("INTERNAL_ERROR"), 500);
};
