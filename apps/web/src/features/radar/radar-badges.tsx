import { MessagesSquare } from "lucide-react";
import { useTranslations } from "next-intl";

import type { RadarItemDto } from "@repo/research/radar-dto";

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
