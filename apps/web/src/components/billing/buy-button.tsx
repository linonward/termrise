"use client";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { track } from "@repo/analytics/client";
import type { CreditPackId } from "@repo/billing/credit-packs";
import type { SubscriptionPlanId } from "@repo/billing/subscription-plans";
import { Button } from "@repo/ui/components/button";

import { errorCodeOf } from "@/lib/api-error";

// Signed in: POST /api/checkout and follow checkoutUrl. Signed out: sign up first.
// `item` is a pack or a subscription plan; the server prices both.
export function BuyButton({
  item,
  signedIn,
  featured,
}: {
  item: { packId: CreditPackId } | { planId: SubscriptionPlanId };
  signedIn: boolean;
  featured: boolean;
}) {
  const t = useTranslations("pricing");
  const tErrors = useTranslations("errors");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const label =
    "planId" in item
      ? t("subscribe", { plan: t(`plan.${item.planId}`) })
      : t("buy", { pack: t(`pack.${item.packId}`) });
  const className = "h-10 w-full text-sm font-semibold";
  const variant = featured ? "default" : "outline";
  if (!signedIn)
    return (
      <Button asChild variant={variant} className={className}>
        <Link href="/sign-up?next=%2Fpricing">{label}</Link>
      </Button>
    );
  async function buy() {
    setPending(true);
    setError(undefined);
    const response = await fetch("/api/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(item),
    }).catch(() => null);
    const body = (await response?.json().catch(() => null)) as {
      checkoutUrl?: string;
      error?: { code?: string };
    } | null;
    if (response?.ok && body?.checkoutUrl) {
      track("checkout_started", item);
      window.location.assign(body.checkoutUrl);
      return;
    }
    setError(tErrors(errorCodeOf(response ?? null, body)));
    setPending(false);
  }
  return (
    <div className="space-y-2">
      <Button
        variant={variant}
        className={className}
        disabled={pending}
        onClick={buy}
      >
        {pending ? t("redirecting") : label}
      </Button>
      {error && (
        <p role="alert" className="text-[13px] text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
