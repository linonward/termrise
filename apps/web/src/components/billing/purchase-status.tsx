import { CircleCheck, CircleX, Hourglass, RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@repo/ui/utils";

// Purchase status badges: docs/design/design-system.md#status
const STATUS = {
  PENDING: {
    icon: Hourglass,
    className: "bg-surface-strong text-muted-foreground",
  },
  PAID: { icon: CircleCheck, className: "bg-success-soft text-success" },
  REFUNDED: {
    icon: RotateCcw,
    className: "bg-surface-strong text-muted-foreground",
  },
  FAILED: { icon: CircleX, className: "bg-destructive-soft text-destructive" },
} as const;

export function PurchaseStatus({ status }: { status: keyof typeof STATUS }) {
  const t = useTranslations("billing.purchaseStatus");
  const { icon: Icon, className } = STATUS[status];
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
