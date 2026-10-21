import { useTranslations } from "next-intl";

import type { ResearchProjectDto } from "@repo/research/research-dto";

import { StatusBadge } from "@/components/status-badge";
import { researchBadge } from "@/lib/status-badges";

export function ResearchStatus({
  status,
}: {
  status: ResearchProjectDto["status"];
}) {
  const t = useTranslations("research.status");
  return <StatusBadge badge={researchBadge(status)}>{t(status)}</StatusBadge>;
}
