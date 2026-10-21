import { useTranslations } from "next-intl";

import type { ExecutionProjectDto } from "@repo/execution/execution-dto";
import { Tag } from "@repo/ui/components/badge";

import { StatusBadge } from "@/components/status-badge";
import { productBadge, revenueSourceBadge } from "@/lib/status-badges";

export function ProductStatus({
  status,
}: {
  status: ExecutionProjectDto["status"];
}) {
  const t = useTranslations("products.status");
  return (
    <StatusBadge badge={productBadge(status)} data-testid="product-status">
      {t(status)}
    </StatusBadge>
  );
}

/** Where a number came from; manual numbers are never shown as verified. */
export function SourceBadge({ source }: { source: string }) {
  const t = useTranslations("products.source");
  const verified = revenueSourceBadge(source);
  if (verified)
    return <StatusBadge badge={verified}>{t("payment_verified")}</StatusBadge>;
  return <Tag>{t(source === "imported" ? "imported" : "manual")}</Tag>;
}
