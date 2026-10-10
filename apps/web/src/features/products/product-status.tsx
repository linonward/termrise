import { useTranslations } from "next-intl";

import type { ExecutionProjectDto } from "@repo/execution/execution-dto";
import { cn } from "@repo/ui/utils";

// Same badge styles as the research status (docs/design/design-system.md#status).
export function ProductStatus({
  status,
}: {
  status: ExecutionProjectDto["status"];
}) {
  const t = useTranslations("products.status");
  const className =
    status === "launched" || status === "measuring"
      ? "bg-success-soft text-success"
      : status === "validating" || status === "building"
        ? "bg-info-soft text-info"
        : "bg-surface-strong text-muted-foreground";
  return (
    <span
      data-testid="product-status"
      className={cn(
        "inline-flex h-6 items-center rounded-full px-2 text-xs font-semibold tracking-[1px] uppercase",
        className,
      )}
    >
      {t(status)}
    </span>
  );
}

/** Where a number came from; manual numbers are never shown as verified. */
export function SourceBadge({ source }: { source: string }) {
  const t = useTranslations("products.source");
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-full px-2 text-xs font-semibold",
        source === "payment_verified"
          ? "bg-success-soft text-success"
          : "bg-surface-strong text-muted-foreground",
      )}
    >
      {t(
        source === "payment_verified" || source === "imported"
          ? source
          : "manual",
      )}
    </span>
  );
}
