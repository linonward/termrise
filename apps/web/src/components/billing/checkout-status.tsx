"use client";
import { CircleAlert, CircleCheck, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { cn } from "@repo/ui/utils";

import { startPolling } from "@/lib/poll";

const INTERVAL_MS = 3_000;
// Alert colors: docs/design/design-system.md#status
const LOOK = {
  pending: {
    icon: LoaderCircle,
    className: "bg-info-soft",
    iconClassName: "text-info",
    spin: true,
    key: "checkoutPending",
  },
  done: {
    icon: CircleCheck,
    className: "bg-success-soft",
    iconClassName: "text-success",
    spin: false,
    key: "checkoutDone",
  },
  timeout: {
    icon: CircleAlert,
    className: "bg-warning-soft",
    iconClassName: "text-warning",
    spin: false,
    key: "checkoutTimeout",
  },
} as const;
const TIMEOUT_MS = 60_000;

// After the success redirect: refresh until the webhook marks the newest purchase PAID,
// at most 60 s (docs/architecture/billing.md#waffo-payment-flow). Never grants anything.
export function CheckoutStatus({ paid }: { paid: boolean }) {
  const t = useTranslations("billing");
  const router = useRouter();
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    if (paid) {
      // Keep the banner, but a reload no longer shows it.
      const url = new URL(window.location.href);
      url.searchParams.delete("checkout");
      window.history.replaceState(window.history.state, "", url);
      return;
    }
    const started = Date.now();
    // Paused in hidden tabs: each refresh re-renders the whole billing page.
    return startPolling(INTERVAL_MS, async () => {
      if (Date.now() - started >= TIMEOUT_MS) {
        setTimedOut(true);
        return true;
      }
      router.refresh();
      return false;
    });
  }, [paid, router]);
  const state = paid ? "done" : timedOut ? "timeout" : "pending";
  const { icon: Icon, className, iconClassName, spin, key } = LOOK[state];
  return (
    <div
      role="status"
      data-testid="checkout-status"
      className={cn(
        "flex flex-col gap-3 rounded-md p-4 md:flex-row md:items-center",
        className,
      )}
    >
      <div className="flex flex-1 gap-3">
        <span
          className={cn(
            "mt-0.5 inline-flex h-fit shrink-0",
            spin && "animate-spin",
          )}
        >
          <Icon aria-hidden="true" className={cn("size-4.5", iconClassName)} />
        </span>
        <div className="space-y-0.5">
          <p className="text-sm font-semibold">{t(`${key}.title`)}</p>
          <p className="text-[13px] text-muted-foreground">
            {t(`${key}.body`)}
          </p>
        </div>
      </div>
    </div>
  );
}
