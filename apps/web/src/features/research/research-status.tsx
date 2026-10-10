import { CircleCheck, CircleX, LoaderCircle, PencilLine } from "lucide-react";
import { useTranslations } from "next-intl";

import type { ResearchProjectDto } from "@repo/research/research-dto";
import { cn } from "@repo/ui/utils";

type Status = ResearchProjectDto["status"];

// Same badge styles as the purchase status (docs/design/design-system.md#status).
function style(status: Status) {
  if (status === "draft")
    return {
      icon: PencilLine,
      className: "bg-surface-strong text-muted-foreground",
    };
  if (status === "completed")
    return { icon: CircleCheck, className: "bg-success-soft text-success" };
  if (status === "failed" || status === "budget_exhausted")
    return { icon: CircleX, className: "bg-destructive-soft text-destructive" };
  if (status === "cancelled" || status === "partial")
    return {
      icon: CircleX,
      className: "bg-surface-strong text-muted-foreground",
    };
  return { icon: LoaderCircle, className: "bg-info-soft text-info" };
}

export function ResearchStatus({ status }: { status: Status }) {
  const t = useTranslations("research.status");
  const { icon: Icon, className } = style(status);
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded-full px-2 text-xs font-semibold tracking-[1px] uppercase",
        className,
      )}
    >
      <Icon aria-hidden="true" className="size-3.5" />
      {t(status)}
    </span>
  );
}
