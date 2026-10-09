import type { createCreditService } from "./credit-service";

type ActivityItem = Awaited<
  ReturnType<ReturnType<typeof createCreditService>["listActivity"]>
>["items"][number];

export type CreditActivityDto = ReturnType<typeof toCreditActivityDto>;

export function toCreditActivityDto(t: ActivityItem) {
  return {
    id: t.id,
    type: t.type,
    amount: t.amount,
    balanceAfter: t.balanceAfter,
    createdAt: t.createdAt.toISOString(),
    taskId: t.taskId,
    packId: t.packId,
    planId: t.planId,
  };
}
