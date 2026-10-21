"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@repo/ui/components/button";
import { cn } from "@repo/ui/utils";

import { errorCodeOf } from "@/lib/api-error";
import { apiFetch } from "@/lib/api-fetch";

// The owner's call on one keyword (docs/product/ux.md#opportunities): off topic leaves it
// out of the score. The analysis only suggests it; the owner's review wins.
export function OffTopicToggle({
  opportunityId,
  keywordId,
  phrase,
  offTopic,
  by,
}: {
  opportunityId: string;
  keywordId: string;
  phrase: string;
  offTopic: boolean;
  by: "ai" | "user" | null;
}) {
  const t = useTranslations("research.topic");
  const tErrors = useTranslations("errors");
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  async function toggle() {
    setPending(true);
    setError(undefined);
    const response = await apiFetch(
      `/api/opportunities/${opportunityId}/keywords/${keywordId}/off-topic`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ offTopic: !offTopic }),
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
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-pressed={offTopic}
        aria-label={t(offTopic ? "markOnTopic" : "markOffTopic", { phrase })}
        disabled={pending}
        onClick={toggle}
        className={cn(
          "whitespace-nowrap",
          offTopic
            ? "bg-warning-soft text-foreground"
            : "text-muted-foreground",
        )}
        data-testid="off-topic-toggle"
      >
        {t(offTopic ? "offTopic" : "onTopic")}
        {by && (
          <span className="text-xs text-muted-foreground">
            · {t(by === "ai" ? "byAi" : "byYou")}
          </span>
        )}
      </Button>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
