import "server-only";
import { cache } from "react";

import { createCreditService } from "@repo/credits/credit-service";
import { db } from "@repo/db/client";

import { beforeBalanceRead } from "@/server/product";

export const getCreditService = () => createCreditService(db());

// Cached per request: the signed-in layout and the page show the same balance.
// Stale tasks are refunded first, so whichever renders first reads the balance
// after the refund (docs/architecture/tasks.md#stale-tasks).
export const balanceForUser = cache(async (userId: string) => {
  await beforeBalanceRead(userId);
  return getCreditService().getBalance(userId);
});
