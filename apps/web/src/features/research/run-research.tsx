"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@repo/ui/components/button";

import { errorCodeOf } from "@/lib/api-error";
import { apiFetch } from "@/lib/api-fetch";

// Starts a run; the API answers when it has finished (synchronous for now). A new
// requestId per click: a retried request of the same click starts one run.
export function RunResearch({
  projectId,
  retry,
}: {
  projectId: string;
  retry: boolean;
}) {
  const t = useTranslations("research");
  const tErrors = useTranslations("errors");
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  async function run() {
    setPending(true);
    setError(undefined);
    const response = await apiFetch(
      `/api/research/projects/${projectId}/runs`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ requestId: crypto.randomUUID() }),
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
    <section aria-labelledby="run-title" className="space-y-3">
      <h2 id="run-title" className="font-heading text-xl font-semibold">
        {t("runTitle")}
      </h2>
      <p className="text-[15px] text-muted-foreground">
        {retry ? t("runRetryBody") : t("runBody")}
      </p>
      <Button className="h-10 px-4" disabled={pending} onClick={run}>
        {pending ? t("running") : t("runButton")}
      </Button>
      {error && (
        <p role="alert" className="text-[13px] text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
