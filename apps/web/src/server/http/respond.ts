import { AuthError } from "@repo/auth/guards";
import {
  AppError,
  ERROR_STATUS,
  errorBody as body,
} from "@repo/observability/errors";
import { logger } from "@repo/observability/logger";

// Maps known errors to the error contract; anything else becomes INTERNAL_ERROR without details.
export function errorResponse(error: unknown): Response {
  if (error instanceof AppError || error instanceof AuthError) {
    const headers: HeadersInit =
      error instanceof AppError && error.retryAfterSeconds
        ? { "Retry-After": String(error.retryAfterSeconds) }
        : {};
    const details = error instanceof AppError ? error.details : undefined;
    return Response.json(body(error.code, details), {
      status: ERROR_STATUS[error.code],
      headers,
    });
  }
  logger.error("http.unhandled_error", { error });
  return Response.json(body("INTERNAL_ERROR"), { status: 500 });
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new AppError("INVALID_INPUT", "Body must be JSON");
  }
}
