"use client";
import { Star } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@repo/ui/components/button";
import { cn } from "@repo/ui/utils";

import { apiFetch } from "@/lib/api-fetch";

// Stars or unstars a radar item or an opportunity (docs/product/ux.md#favorites).
// `path` is the API path of the star, e.g. /api/radar/items/<id>/star.
export function StarButton({
  path,
  starred: initial,
  name,
}: {
  path: string;
  starred: boolean;
  /** What is starred, for the screen reader label. */
  name: string;
}) {
  const t = useTranslations("favorites");
  const router = useRouter();
  const [starred, setStarred] = useState(initial);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function toggle() {
    const next = !starred;
    setPending(true);
    setFailed(false);
    setStarred(next);
    const response = await apiFetch(path, {
      method: next ? "PUT" : "DELETE",
    }).catch(() => null);
    setPending(false);
    if (!response?.ok) {
      setStarred(!next);
      setFailed(true);
      return;
    }
    router.refresh();
  }

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-pressed={starred}
      aria-label={t(starred ? "unstar" : "star", { name })}
      title={failed ? t("failed") : undefined}
      disabled={pending}
      onClick={toggle}
      data-testid="star-button"
    >
      <Star
        aria-hidden="true"
        className={cn(
          "size-4",
          starred ? "fill-brand text-brand" : "text-muted-foreground",
          failed && "text-destructive",
        )}
      />
    </Button>
  );
}
