"use client";
import { CircleAlert, CircleCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { Button } from "@repo/ui/components/button";

import { adjustCredits, type AdjustState } from "@/app/admin/actions";

const FIELD =
  "h-12 w-full rounded-md border border-border-strong bg-background px-4 text-[15px] focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none";

// `adjustmentId` is rendered by the server: resubmitting the same form is idempotent,
// and a successful adjustment re-renders the page with a new id.
export function AdjustCreditsForm({
  userId,
  adjustmentId,
  limit,
}: {
  userId: string;
  adjustmentId: string;
  limit: number;
}) {
  const t = useTranslations("admin");
  const [state, action, pending] = useActionState<AdjustState, FormData>(
    adjustCredits,
    { status: "idle" },
  );
  const failed = state.status === "error" ? state : undefined;
  return (
    <form
      action={action}
      aria-labelledby="adjust-title"
      className="space-y-4 md:w-100"
    >
      <h2 id="adjust-title" className="font-heading text-xl font-semibold">
        {t("adjustTitle")}
      </h2>
      {state.status === "done" && (
        <p
          role="status"
          className="flex gap-3 rounded-md bg-success-soft p-4 text-sm font-semibold"
        >
          <CircleCheck
            aria-hidden="true"
            className="size-4.5 shrink-0 text-success"
          />
          {t("adjusted", { balance: state.balance })}
        </p>
      )}
      {failed && (
        <p
          role="alert"
          className="flex gap-3 rounded-md bg-destructive-soft p-4 text-sm font-semibold"
        >
          <CircleAlert
            aria-hidden="true"
            className="size-4.5 shrink-0 text-destructive"
          />
          {t(`adjustError.${failed.code}`)}
        </p>
      )}
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="id" value={adjustmentId} />
      <label className="block space-y-2 text-[13px] font-medium">
        <span>{t("amount")}</span>
        <input
          key={`amount-${adjustmentId}`}
          name="amount"
          type="number"
          step={1}
          min={-limit}
          max={limit}
          required
          disabled={pending}
          defaultValue={failed?.amount}
          className={FIELD}
        />
        <span className="block font-normal text-muted-foreground">
          {t("amountHint", { limit })}
        </span>
      </label>
      <label className="block space-y-2 text-[13px] font-medium">
        <span>{t("reason")}</span>
        <input
          key={`reason-${adjustmentId}`}
          name="reason"
          required
          maxLength={200}
          autoComplete="off"
          disabled={pending}
          defaultValue={failed?.reason}
          className={FIELD}
        />
        <span className="block font-normal text-muted-foreground">
          {t("reasonHint")}
        </span>
      </label>
      <Button type="submit" className="h-12 w-full px-4" disabled={pending}>
        {pending ? t("adjusting") : t("adjust")}
      </Button>
    </form>
  );
}
