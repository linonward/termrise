"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

import type { ExperimentDto } from "@repo/research/research-dto";
import { Button } from "@repo/ui/components/button";
import { cn } from "@repo/ui/utils";

import { errorCodeOf } from "@/lib/api-error";
import { apiFetch } from "@/lib/api-fetch";

import { FIELD } from "./decision-form";

// Moves an experiment to its next status; a pass or fail needs what was observed.
export function ExperimentProgress({
  opportunityId,
  experiment,
}: {
  opportunityId: string;
  experiment: ExperimentDto;
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
    const note = String(data.get("resultNote") ?? "").trim();
    const response = await apiFetch(
      `/api/opportunities/${opportunityId}/experiments/${experiment.id}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          status: data.get("status"),
          ...(note ? { resultNote: note } : {}),
        }),
      },
    ).catch(() => null);
    const body = await response?.json().catch(() => null);
    setPending(false);
    if (!response?.ok) {
      setError(tErrors(errorCodeOf(response ?? null, body)));
      return;
    }
    router.refresh();
  }

  return (
    <form
      className="flex flex-col gap-3 md:flex-row md:items-end"
      onSubmit={(event) => {
        event.preventDefault();
        void submit(event.currentTarget);
      }}
    >
      <label className="block space-y-2 text-[13px] font-medium md:w-44">
        <span>{t("nextStatus")}</span>
        <select name="status" required className={cn(FIELD, "h-10")}>
          {experiment.nextStatuses.map((status) => (
            <option key={status} value={status}>
              {t(`experimentStatus.${status}`)}
            </option>
          ))}
        </select>
      </label>
      <label className="block flex-1 space-y-2 text-[13px] font-medium">
        <span>{t("resultNote")}</span>
        <input
          name="resultNote"
          maxLength={1000}
          placeholder={t("resultNoteHint")}
          className={cn(FIELD, "h-10")}
        />
      </label>
      <Button
        type="submit"
        variant="outline"
        className="h-10 px-4"
        disabled={pending}
      >
        {pending ? t("saving") : t("update")}
      </Button>
      {error && (
        <p role="alert" className="text-[13px] text-destructive md:basis-full">
          {error}
        </p>
      )}
    </form>
  );
}
