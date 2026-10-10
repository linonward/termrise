import type { createBillingService } from "./billing-service";

type Purchase = Awaited<
  ReturnType<ReturnType<typeof createBillingService>["listPurchases"]>
>[number];

// Public shape of a purchase in API responses: no provider ids.
export function toPurchaseDto(p: Purchase) {
  return {
    id: p.id,
    packId: p.packId,
    amountUsd: p.amountUsd,
    credits: p.credits,
    status: p.status,
    createdAt: p.createdAt.toISOString(),
  };
}
