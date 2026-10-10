"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@repo/ui/components/button";

import { errorCodeOf } from "@/lib/api-error";
import { apiFetch } from "@/lib/api-fetch";

// Two clicks: the first asks for confirmation, the second deletes the draft.
export function DeleteProject({ projectId }: { projectId: string }) {
  const t = useTranslations("research");
  const tErrors = useTranslations("errors");
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  async function remove() {
    setPending(true);
    setError(undefined);
    const response = await apiFetch(`/api/research/projects/${projectId}`, {
      method: "DELETE",
    }).catch(() => null);
    if (response?.ok) {
      router.push("/research");
      router.refresh();
      return;
    }
    const body = await response?.json().catch(() => null);
    setError(tErrors(errorCodeOf(response ?? null, body)));
    setPending(false);
  }
  return (
    <div className="space-y-3">
      <p className="text-[13px] text-muted-foreground">
        {confirming ? t("deleteConfirm") : t("deleteHint")}
      </p>
      {confirming ? (
        <div className="flex flex-wrap gap-3">
          <Button
            variant="destructive"
            className="h-10 px-4"
            disabled={pending}
            onClick={remove}
          >
            {pending ? t("deleting") : t("deleteYes")}
          </Button>
          <Button
            variant="outline"
            className="h-10 px-4"
            disabled={pending}
            onClick={() => setConfirming(false)}
          >
            {t("deleteKeep")}
          </Button>
        </div>
      ) : (
        <Button
          variant="outline"
          className="h-10 px-4"
          onClick={() => setConfirming(true)}
        >
          {t("delete")}
        </Button>
      )}
      {error && (
        <p role="alert" className="text-[13px] text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
