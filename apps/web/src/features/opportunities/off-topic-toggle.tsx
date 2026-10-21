"use client";
import { CircleCheck, CircleSlash } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

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
      <button
        type="button"
        aria-pressed={offTopic}
        aria-label={t(offTopic ? "markOnTopic" : "markOffTopic", { phrase })}
        disabled={pending}
        onClick={toggle}
        className={cn(
          "inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-[13px] font-semibold whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50",
          offTopic
            ? "border-transparent bg-warning-soft text-warning"
            : "border-border hover:bg-surface",
        )}
        data-testid="off-topic-toggle"
      >
        {offTopic ? (
          <CircleSlash aria-hidden="true" className="size-3.5 shrink-0" />
        ) : (
          <CircleCheck
            aria-hidden="true"
            className="size-3.5 shrink-0 text-muted-foreground"
          />
        )}
        {t(offTopic ? "offTopic" : "onTopic")}
        {by && (
          <span
            className={cn(
              "text-xs font-medium",
              offTopic ? "text-warning" : "text-muted-foreground",
            )}
          >
            {t(by === "ai" ? "byAi" : "byYou")}
          </span>
        )}
      </button>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
