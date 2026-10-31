"use client";
import { useTranslations } from "next-intl";

import { Button } from "@repo/ui/components/button";

import { usePoolAction } from "@/features/pool/pool-action";

// Queues a new-words round now, besides the daily one.
export function StartNewWords({ open }: { open: boolean }) {
  const t = useTranslations("newWords");
  const { post, pending, error } = usePoolAction();
  return (
    <div className="space-y-1">
      <Button
        variant="outline"
        className="h-10 px-4"
        disabled={pending || open}
        onClick={() => post("/api/pool/new-words/rounds", {})}
      >
        {open ? t("roundOpen") : t("roundStart")}
      </Button>
      {error && (
        <p role="alert" className="text-[13px] text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
