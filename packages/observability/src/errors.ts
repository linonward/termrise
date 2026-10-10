// Error codes and HTTP statuses: docs/architecture/api.md#error-contract.
export const ERROR_STATUS = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  INVALID_INPUT: 400,
  NOT_FOUND: 404,
  RATE_LIMITED: 429,
  INSUFFICIENT_CREDITS: 402,
  UPLOAD_NOT_FOUND: 404,
  TASK_NOT_FOUND: 404,
  PURCHASE_NOT_FOUND: 404,
  SUBSCRIPTION_EXISTS: 409,
  SUBSCRIPTION_NOT_FOUND: 404,
  RESEARCH_PROJECT_NOT_FOUND: 404,
  RESEARCH_PROJECT_LOCKED: 409,
  RESEARCH_PROVIDER_UNAVAILABLE: 503,
  OPPORTUNITY_NOT_FOUND: 404,
  OPPORTUNITY_DECISION_INVALID: 409,
  EXPERIMENT_NOT_FOUND: 404,
  EXPERIMENT_FINISHED: 409,
  PROVIDER_ERROR: 502,
  PAYMENT_ERROR: 502,
  STORAGE_ERROR: 502,
  INTERNAL_ERROR: 500,
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS;

export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    message: string = code,
    public retryAfterSeconds?: number,
    /** Extra fields returned inside `error`, e.g. the failed task id. */
    public details?: Record<string, string>,
  ) {
    super(message);
  }
}

// English debug text only; the UI localizes by `code` (docs/product/ux.md#internationalization).
export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  UNAUTHORIZED: "Sign in required.",
  FORBIDDEN: "Not allowed.",
  INVALID_INPUT: "The request is invalid.",
  NOT_FOUND: "Not found.",
  RATE_LIMITED: "Too many requests.",
  UPLOAD_NOT_FOUND: "Upload not found.",
  TASK_NOT_FOUND: "Task not found.",
  PURCHASE_NOT_FOUND: "Purchase not found.",
  SUBSCRIPTION_EXISTS: "You already have a subscription.",
  SUBSCRIPTION_NOT_FOUND: "No subscription to cancel.",
  RESEARCH_PROJECT_NOT_FOUND: "Research project not found.",
  RESEARCH_PROJECT_LOCKED: "Only a draft research project can be changed.",
  RESEARCH_PROVIDER_UNAVAILABLE: "No keyword data provider is configured.",
  OPPORTUNITY_NOT_FOUND: "Opportunity not found.",
  OPPORTUNITY_DECISION_INVALID:
    "This decision is not possible from the opportunity's current status.",
  EXPERIMENT_NOT_FOUND: "Experiment not found.",
  EXPERIMENT_FINISHED: "A finished experiment can no longer change.",
  INSUFFICIENT_CREDITS: "You don't have enough credits.",
  PROVIDER_ERROR: "The task provider is unavailable.",
  STORAGE_ERROR: "Storage is unavailable.",
  PAYMENT_ERROR: "The payment provider is unavailable.",
  INTERNAL_ERROR: "Something went wrong.",
};

/** The JSON error body of the API contract. */
export function errorBody(code: ErrorCode, details?: Record<string, string>) {
  return { error: { code, message: ERROR_MESSAGES[code], ...details } };
}
