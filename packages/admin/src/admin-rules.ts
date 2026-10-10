// Admin console rules without database code: the web app's /admin pages import them.

/** Largest single adjustment; bigger changes need several, each with a reason. */
export const ADJUST_LIMIT = 1000;

export type AdminErrorCode =
  | "INVALID_INPUT"
  | "INVALID_AMOUNT"
  | "INVALID_REASON"
  | "USER_NOT_FOUND"
  | "INSUFFICIENT_CREDITS"
  | "IDEMPOTENCY_CONFLICT";
