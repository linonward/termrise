import type { Database } from "@repo/db/client";

import type { PaymentProvider } from "./types";

// Shared by the purchase and subscription flows of BillingService.

export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export type FlowDeps = {
  database: Database;
  provider: PaymentProvider;
  now: () => Date;
};

// Waffo checkout sessions expire after 45 min; see docs/architecture/billing.md#pending-expiry.
export const PENDING_EXPIRY_MS = 60 * 60_000;

// Partial refunds reverse credits in proportion, rounded up: docs/architecture/billing.md#purchase-refund.
// The ratio uses what the provider charged, which can differ from our price snapshot.
export function refundCredits(
  credits: number,
  refundedCents: number | undefined,
  paidCents: number,
) {
  if (refundedCents === undefined || refundedCents >= paidCents) return credits;
  return Math.max(1, Math.ceil((credits * refundedCents) / paidCents));
}
