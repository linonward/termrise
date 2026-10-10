import { MessagesSquare } from "lucide-react";
import { useTranslations } from "next-intl";

import type { RadarItemDto } from "@repo/research/radar-dto";
import { cn } from "@repo/ui/utils";

/** The public source of a radar item. */
export function SourceBadge({
  provider,
}: {
  provider: RadarItemDto["provider"];
}) {
  const t = useTranslations("radar.provider");
  return (
    <span className="inline-flex h-5 items-center rounded-full bg-surface-strong px-2 text-xs font-semibold whitespace-nowrap text-muted-foreground">
      {t(provider)}
    </span>
  );
}

/** Points and comments measure discussion, never search demand (product.md F01). */
export function DiscussionNotice() {
  const t = useTranslations("radar");
  return (
    <div
      role="note"
      className="flex gap-3 rounded-md bg-info-soft p-4"
      data-testid="discussion-notice"
    >
      <MessagesSquare
        aria-hidden="true"
        className="size-4.5 shrink-0 text-info"
      />
      <div className="space-y-0.5">
        <p className="text-sm font-semibold">{t("noticeTitle")}</p>
        <p className="text-[13px] text-muted-foreground">{t("noticeBody")}</p>
      </div>
    </div>
  );
}

/** The item's lifecycle from discussion counts (radar-lifecycle.ts). */
export function LifecycleBadge({
  lifecycle,
}: {
  lifecycle: RadarItemDto["lifecycle"];
}) {
  const t = useTranslations("radar.lifecycle");
  return (
    <span
      data-testid="lifecycle"
      className={cn(
        "inline-flex h-6 items-center rounded-full px-2 text-xs font-semibold tracking-[1px] whitespace-nowrap uppercase",
        lifecycle === "breakout"
          ? "bg-success-soft text-success"
          : lifecycle === "emerging"
            ? "bg-info-soft text-info"
            : lifecycle === "insufficient_data"
              ? "bg-surface-strong text-subtle-foreground"
              : "bg-surface-strong text-muted-foreground",
      )}
    >
      {t(lifecycle)}
    </span>
  );
}

/** Points on Hacker News; Google Trends' approximate searches, a lower bound. */
export function Activity({
  provider,
  score,
}: {
  provider: RadarItemDto["provider"];
  score: number | null;
}) {
  const t = useTranslations("radar");
  if (score === null) return <>—</>;
  return (
    <>
      {provider === "google_trends"
        ? t("activity.searches", { count: score })
        : t("activity.points", { count: score })}
    </>
  );
}
