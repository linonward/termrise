"use client";
import { Eye, EyeOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@repo/ui/components/button";

import { apiFetch } from "@/lib/api-fetch";

// Hides a new word from the list, or shows it again.
export function HideWord({
  id,
  hidden,
  phrase,
}: {
  id: string;
  hidden: boolean;
  phrase: string;
}) {
  const t = useTranslations("newWords");
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const Icon = hidden ? Eye : EyeOff;
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      disabled={pending}
      aria-label={t(hidden ? "show" : "hide", { phrase })}
      title={failed ? t("hideFailed") : t(hidden ? "show" : "hide", { phrase })}
      onClick={async () => {
        setPending(true);
        setFailed(false);
        const res = await apiFetch(`/api/pool/new-words/${id}/hide`, {
          method: hidden ? "DELETE" : "PUT",
        }).catch(() => null);
        setPending(false);
        if (!res?.ok) return setFailed(true);
        router.refresh();
      }}
    >
      <Icon aria-hidden="true" className="size-5 text-muted-foreground" />
    </Button>
  );
}
