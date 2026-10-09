"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@repo/ui/components/button";

import { errorCodeOf } from "@/lib/api-error";

// Two clicks: the first asks for confirmation, the second cancels in Waffo.
export function CancelSubscription() {
  const t = useTranslations("billing.subscription");
  const tErrors = useTranslations("errors");
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  async function cancel() {
    setPending(true);
    setError(undefined);
    const response = await fetch("/api/billing/subscription/cancel", {
      method: "POST",
    }).catch(() => null);
    if (response?.ok) {
      router.refresh();
      return;
    }
    const body = await response?.json().catch(() => null);
    setError(tErrors(errorCodeOf(response ?? null, body)));
    setPending(false);
  }
  if (!confirming)
    return (
      <Button
        variant="outline"
        className="h-10 px-4"
        onClick={() => setConfirming(true)}
      >
        {t("cancel")}
      </Button>
    );
  return (
    <div className="space-y-3">
      <p className="text-[13px] text-muted-foreground">{t("confirm")}</p>
      <div className="flex flex-wrap gap-3">
        <Button
          variant="destructive"
          className="h-10 px-4"
          disabled={pending}
          onClick={cancel}
        >
          {t("confirmCancel")}
        </Button>
        <Button
          variant="outline"
          className="h-10 px-4"
          disabled={pending}
          onClick={() => setConfirming(false)}
        >
          {t("keep")}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-[13px] text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
