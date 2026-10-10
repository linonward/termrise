"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

import {
  type Decision,
  REASON_MAX_LENGTH,
} from "@repo/research/opportunity-rules";
import { Button } from "@repo/ui/components/button";
import { cn } from "@repo/ui/utils";

import { errorCodeOf } from "@/lib/api-error";
import { apiFetch } from "@/lib/api-fetch";

export const FIELD =
  "w-full rounded-md border border-border-strong bg-background px-4 text-[15px] focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none disabled:opacity-50";

// A person's Go / Validate / No-go with a reason (docs/product/ux.md#opportunities).
// The API offers only the decisions possible from the current status.
export function DecisionForm({
  opportunityId,
  nextDecisions,
}: {
  opportunityId: string;
  nextDecisions: readonly Decision[];
}) {
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
      `/api/opportunities/${opportunityId}/decisions`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          decision: data.get("decision"),
          reason: String(data.get("reason") ?? ""),
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
      <fieldset className="space-y-2">
        <legend className="mb-2 text-[13px] font-medium">{t("choose")}</legend>
        {nextDecisions.map((decision, index) => (
          <label
            key={decision}
            className="flex items-center gap-2 text-[15px] font-medium"
          >
            <input
              type="radio"
              name="decision"
              value={decision}
              required
              defaultChecked={index === 0}
              className="size-4 accent-brand"
            />
            {t(`action.${decision}`)}
          </label>
        ))}
      </fieldset>
      <label className="block space-y-2 text-[13px] font-medium">
        <span>{t("reason")}</span>
        <textarea
          name="reason"
          required
          rows={3}
          maxLength={REASON_MAX_LENGTH}
          className={cn(FIELD, "py-3")}
        />
        <span className="block font-normal text-muted-foreground">
          {t("reasonHint")}
        </span>
      </label>
      <Button type="submit" className="h-10 px-4" disabled={pending}>
        {pending ? t("saving") : t("save")}
      </Button>
      {error && (
        <p role="alert" className="text-[13px] text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
