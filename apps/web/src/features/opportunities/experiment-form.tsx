"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@repo/ui/components/button";
import { cn } from "@repo/ui/utils";

import { errorCodeOf } from "@/lib/api-error";
import { apiFetch } from "@/lib/api-fetch";

import { FIELD } from "./decision-form";

const KINDS = [
  "review_analysis",
  "free_tool",
  "landing_smoke_test",
  "sample_paid_upgrade",
  "paid_pilot",
] as const;
const TEXT_FIELDS = [
  "hypothesis",
  "channel",
  "metric",
  "successThreshold",
  "stopCondition",
] as const;

// Plans a validation experiment without interviews (docs/product/product.md#f06-无访谈验证).
export function ExperimentForm({ opportunityId }: { opportunityId: string }) {
  const t = useTranslations("decisions");
  const tErrors = useTranslations("errors");
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  async function submit(form: HTMLFormElement) {
    const data = new FormData(form);
    setPending(true);
    setError(undefined);
    const response = await apiFetch(
      `/api/opportunities/${opportunityId}/experiments`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: data.get("kind"),
          ...Object.fromEntries(
            TEXT_FIELDS.map((key) => [key, String(data.get(key) ?? "")]),
          ),
          budgetUsd: Number(data.get("budgetUsd")),
          durationDays: Number(data.get("durationDays")),
        }),
      },
    ).catch(() => null);
    const body = await response?.json().catch(() => null);
    setPending(false);
    if (!response?.ok) {
      setError(tErrors(errorCodeOf(response ?? null, body)));
      return;
    }
    form.reset();
    router.refresh();
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        void submit(event.currentTarget);
      }}
    >
      <label className="block space-y-2 text-[13px] font-medium">
        <span>{t("field.kind")}</span>
        <select name="kind" required className={cn(FIELD, "h-11")}>
          {KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {t(`kind.${kind}`)}
            </option>
          ))}
        </select>
      </label>
      {TEXT_FIELDS.map((key) => (
        <label key={key} className="block space-y-2 text-[13px] font-medium">
          <span>{t(`field.${key}`)}</span>
          <input
            name={key}
            required
            maxLength={500}
            placeholder={t(`placeholder.${key}`)}
            className={cn(FIELD, "h-11")}
          />
        </label>
      ))}
      <div className="flex gap-4">
        <label className="block flex-1 space-y-2 text-[13px] font-medium">
          <span>{t("field.budgetUsd")}</span>
          <input
            name="budgetUsd"
            type="number"
            required
            min={0}
            max={10000}
            step={0.01}
            defaultValue={0}
            className={cn(FIELD, "h-11")}
          />
        </label>
        <label className="block flex-1 space-y-2 text-[13px] font-medium">
          <span>{t("field.durationDays")}</span>
          <input
            name="durationDays"
            type="number"
            required
            min={1}
            max={365}
            step={1}
            defaultValue={14}
            className={cn(FIELD, "h-11")}
          />
        </label>
      </div>
      <Button type="submit" className="h-10 px-4" disabled={pending}>
        {pending ? t("saving") : t("addExperiment")}
      </Button>
      {error && (
        <p role="alert" className="text-[13px] text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
