// Client view of the API error contract (docs/architecture/api.md#error-contract).
// Kept in sync with ERROR_STATUS by api-error.test.ts.
export const API_ERROR_CODES = [
  "UNAUTHORIZED",
  "FORBIDDEN",
  "INVALID_INPUT",
  "NOT_FOUND",
  "RATE_LIMITED",
  "INSUFFICIENT_CREDITS",
  "UPLOAD_NOT_FOUND",
  "TASK_NOT_FOUND",
  "PURCHASE_NOT_FOUND",
  "SUBSCRIPTION_EXISTS",
  "SUBSCRIPTION_NOT_FOUND",
  "RESEARCH_PROJECT_NOT_FOUND",
  "RESEARCH_PROJECT_LOCKED",
  "RESEARCH_PROVIDER_UNAVAILABLE",
  "OPPORTUNITY_NOT_FOUND",
  "PROVIDER_ERROR",
  "PAYMENT_ERROR",
  "STORAGE_ERROR",
  "INTERNAL_ERROR",
] as const;

/** NETWORK_ERROR: the request never got an answer. Each code has an `errors.*` message. */
export type ApiErrorCode = (typeof API_ERROR_CODES)[number] | "NETWORK_ERROR";

/** Unknown codes and non-JSON failures (e.g. a proxy 500) fall back to INTERNAL_ERROR. */
export function errorCodeOf(
  response: Response | null,
  body: unknown,
): ApiErrorCode {
  if (!response) return "NETWORK_ERROR";
  const code = (body as { error?: { code?: unknown } } | null)?.error?.code;
  return API_ERROR_CODES.find((c) => c === code) ?? "INTERNAL_ERROR";
}
