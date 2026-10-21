import { useTranslations } from "next-intl";

import type { OpportunityDto } from "@repo/research/research-dto";

import { StatusBadge } from "@/components/status-badge";
import { needsReviewBadge, opportunityBadge } from "@/lib/status-badges";

export function OpportunityStatus({
  status,
}: {
  status: OpportunityDto["status"];
}) {
  const t = useTranslations("opportunities.status");
  return (
    <StatusBadge badge={opportunityBadge(status)}>{t(status)}</StatusBadge>
  );
}

/** A high score on thin evidence, or a cluster mostly off topic: check it first. */
export function NeedsReview() {
  const t = useTranslations("opportunities");
  return (
    <StatusBadge badge={needsReviewBadge} data-testid="needs-review">
      {t("needsReview")}
    </StatusBadge>
  );
}
