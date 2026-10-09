import { CircleAlert, CircleCheck, Hourglass } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@repo/ui/utils";

// Subscription status badges, same look as purchase badges: docs/design/design-system.md#status
const STATUS = {
  ACTIVE: { icon: CircleCheck, className: "bg-success-soft text-success" },
  PAST_DUE: { icon: CircleAlert, className: "bg-warning-soft text-warning" },
  CANCELING: {
    icon: Hourglass,
    className: "bg-surface-strong text-muted-foreground",
  },
} as const;

export type ShownSubscriptionStatus = keyof typeof STATUS;

export function SubscriptionStatus({
  status,
}: {
  status: ShownSubscriptionStatus;
}) {
  const t = useTranslations("billing.subscription.status");
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
