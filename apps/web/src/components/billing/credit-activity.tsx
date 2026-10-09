"use client";
import { useTranslations } from "next-intl";
import { useState } from "react";

import type { CreditPackId } from "@repo/billing/credit-packs";
import type { SubscriptionPlanId } from "@repo/billing/subscription-plans";
import type { CreditActivityDto } from "@repo/credits/credit-activity";
import { Button } from "@repo/ui/components/button";

import { LocalDateTime } from "@/components/local-date-time";

export function CreditActivity({
  initial,
  initialCursor,
}: {
  initial: CreditActivityDto[];
  initialCursor: string | null;
}) {
  const t = useTranslations("billing");
  const ta = useTranslations("billing.activity");
  const tp = useTranslations("pricing");
  const [items, setItems] = useState(initial);
  const [cursor, setCursor] = useState(initialCursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  async function loadMore() {
    setLoading(true);
    setError(false);
    const response = await fetch(
      `/api/billing/credit-activity?cursor=${encodeURIComponent(cursor!)}`,
    ).catch(() => null);
    const body = response?.ok ? await response.json() : null;
    if (body) {
      setItems((current) => [...current, ...body.transactions]);
      setCursor(body.nextCursor);
    } else setError(true);
    setLoading(false);
  }

  function label(item: CreditActivityDto) {
    const pack = item.packId ? tp(`pack.${item.packId as CreditPackId}`) : "";
    switch (item.type) {
      case "SIGNUP_BONUS":
        return ta("signupBonus");
      case "PURCHASE":
        return ta("purchase", { pack });
      case "PURCHASE_REVERSAL":
        return ta("purchaseReversal", { pack });
      case "SUBSCRIPTION_GRANT":
        return ta("subscription", {
          plan: tp(`plan.${item.planId as SubscriptionPlanId}`),
        });
      case "SUBSCRIPTION_REVERSAL":
        return ta("subscriptionReversal", {
          plan: tp(`plan.${item.planId as SubscriptionPlanId}`),
        });
      case "TASK_DEBIT":
        return ta("task");
      case "TASK_REFUND":
        return ta("taskRefund");
      case "ADMIN_ADJUSTMENT":
        return ta("adjustment");
    }
  }

  const columns = [
    t("date"),
    ta("activityColumn"),
    t("creditsColumn"),
    ta("balance"),
  ];
  return (
    <div className="space-y-8">
      <div className="overflow-x-auto">
        <table className="w-full min-w-140 text-left text-sm">
          <thead className="text-xs font-semibold tracking-[1px] text-muted-foreground uppercase">
            <tr className="border-b border-border">
              {columns.map((c) => (
                <th key={c} scope="col" className="py-3 pr-4 font-semibold">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr
                key={item.id}
                data-testid="credit-activity-row"
                className="border-b border-border"
              >
                <td className="py-3.5 pr-4">
                  <LocalDateTime iso={item.createdAt} />
                </td>
                <td className="py-3.5 pr-4">{label(item)}</td>
                <td
                  className={`py-3.5 pr-4 font-semibold tabular-nums ${item.amount > 0 ? "text-success" : ""}`}
                >
                  {item.amount > 0 ? `+${item.amount}` : `−${-item.amount}`}
                </td>
                <td className="py-3.5 tabular-nums">{item.balanceAfter}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {cursor && (
        <div className="flex flex-col items-center gap-2">
          <Button
            variant="outline"
            className="h-10 px-6"
            disabled={loading}
            onClick={() => void loadMore()}
          >
            {loading ? ta("loading") : ta("loadMore")}
          </Button>
          {error && (
            <p role="alert" className="text-[13px] text-destructive">
              {ta("loadError")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
