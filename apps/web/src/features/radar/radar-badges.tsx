import { MessagesSquare } from "lucide-react";
import { useTranslations } from "next-intl";

import type { RadarItemDto } from "@repo/research/radar-dto";
import { Tag } from "@repo/ui/components/badge";

import { StatusBadge } from "@/components/status-badge";
import { lifecycleBadge } from "@/lib/status-badges";

/** The public source of a radar item. */
export function SourceBadge({
  provider,
}: {
  provider: RadarItemDto["provider"];
}) {
  const t = useTranslations("radar.provider");
  return <Tag>{t(provider)}</Tag>;
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
    <StatusBadge badge={lifecycleBadge(lifecycle)} data-testid="lifecycle">
      {t(lifecycle)}
    </StatusBadge>
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
