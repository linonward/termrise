import { CircleAlert } from "lucide-react";
import { useTranslations } from "next-intl";

import type { OpportunityDto } from "@repo/research/research-dto";
import { cn } from "@repo/ui/utils";

const badge =
  "inline-flex h-6 items-center gap-1 rounded-full px-2 text-xs font-semibold tracking-[1px] uppercase";

// Same badge styles as the research status (docs/design/design-system.md#status).
export function OpportunityStatus({
  status,
}: {
  status: OpportunityDto["status"];
}) {
  const t = useTranslations("opportunities.status");
  const className =
    status === "go"
      ? "bg-success-soft text-success"
      : status === "no_go"
        ? "bg-destructive-soft text-destructive"
        : status === "needs_validation"
          ? "bg-info-soft text-info"
          : "bg-surface-strong text-muted-foreground";
  return <span className={cn(badge, className)}>{t(status)}</span>;
}

/** A high score built on thin evidence: check it before trusting it. */
export function NeedsReview() {
  const t = useTranslations("opportunities");
  return (
    <span
      className={cn(badge, "bg-warning-soft text-warning")}
      data-testid="needs-review"
    >
      <CircleAlert aria-hidden="true" className="size-3.5" />
      {t("needsReview")}
    </span>
  );
}
