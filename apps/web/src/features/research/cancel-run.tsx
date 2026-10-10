"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@repo/ui/components/button";

import { errorCodeOf } from "@/lib/api-error";
import { apiFetch } from "@/lib/api-fetch";

// Cancels the queued or running run (docs/product/ux.md#research).
export function CancelRun({
  projectId,
  runId,
}: {
  projectId: string;
  runId: string;
}) {
  const t = useTranslations("research");
  const tErrors = useTranslations("errors");
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  async function cancel() {
    setPending(true);
    setError(undefined);
    const response = await apiFetch(
      `/api/research/projects/${projectId}/runs/${runId}/cancel`,
      { method: "POST" },
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
    <div className="space-y-2">
      <Button
        variant="outline"
        className="h-10 px-4"
        disabled={pending}
        onClick={cancel}
      >
        {pending ? t("cancelling") : t("cancelRun")}
      </Button>
      {error && (
        <p role="alert" className="text-[13px] text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
