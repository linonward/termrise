"use client";
import { Eye, EyeOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@repo/ui/components/button";

import { apiFetch } from "@/lib/api-fetch";

// Hides a launch site or a platform site from its list, or shows it again.
export function HideSite({
  id,
  hidden,
  site,
  list = "launch-sites",
}: {
  id: string;
  hidden: boolean;
  site: string;
  list?: "launch-sites" | "platform-sites";
}) {
  const t = useTranslations("discover");
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const Icon = hidden ? Eye : EyeOff;
  const label = t(hidden ? "show" : "hide", { site });
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      disabled={pending}
      aria-label={label}
      title={failed ? t("hideFailed") : label}
      onClick={async () => {
        setPending(true);
        setFailed(false);
        const res = await apiFetch(`/api/pool/${list}/${id}/hide`, {
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
