import { Coins } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";

import type { CreditPackId } from "@repo/billing/credit-packs";
import type { toPurchaseDto } from "@repo/billing/purchase-dto";
import type { SubscriptionDto } from "@repo/billing/subscription-dto";
import type { SubscriptionPlanId } from "@repo/billing/subscription-plans";
import type { CreditActivityDto } from "@repo/credits/credit-activity";
import { Button } from "@repo/ui/components/button";

import { CancelSubscription } from "@/components/billing/cancel-subscription";
import { CheckoutStatus } from "@/components/billing/checkout-status";
import { CreditActivity } from "@/components/billing/credit-activity";
import { PurchaseStatus } from "@/components/billing/purchase-status";
import { SubscriptionStatus } from "@/components/billing/subscription-status";
import { LocalDateTime } from "@/components/local-date-time";
import { formatUsd } from "@/lib/format-usd";
import { apiGet, getBalance } from "@/server/api/api";
import { getRequestSession } from "@/server/auth/auth";
import product from "@product";

type PurchaseDto = ReturnType<typeof toPurchaseDto>;

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>;
}) {
  // Hidden while the product does not charge (product.config.ts billingEnabled).
  if (!product.billingEnabled) notFound();
  const session = await getRequestSession();
  if (!session) redirect("/sign-in?next=%2Fbilling");
  const t = await getTranslations("billing");
  const tp = await getTranslations("pricing");
  const checkoutParam = (await searchParams).checkout;
  // First: it refunds stale tasks, so the activity below includes the refunds.
  const balance = await getBalance();
  const [activity, { purchases }, subscriptionCheckout, billing] =
    await Promise.all([
      apiGet<{
        transactions: CreditActivityDto[];
        nextCursor: string | null;
      }>("/api/billing/credit-activity"),
      apiGet<{ purchases: PurchaseDto[] }>("/api/billing/purchases"),
      checkoutParam === "subscription"
        ? apiGet<{ checkout: { granted: boolean } | null }>(
            "/api/billing/subscription/checkout-status",
          ).then((r) => r.checkout)
        : null,
      apiGet<{
        subscription: SubscriptionDto | null;
        customerPortalUrl: string;
      }>("/api/billing/subscription"),
    ]);
  const { subscription } = billing;
  // Refunded, failed or no purchase: nothing is on its way, so no banner.
  const newest = purchases[0]?.status;
  const checkout =
    checkoutParam === "success"
      ? (newest === "PENDING" || newest === "PAID") && {
          paid: newest === "PAID",
        }
      : subscriptionCheckout && { paid: subscriptionCheckout.granted };
  // Paid but not yet activated reads as active; Waffo's events catch up in seconds.
  const shownStatus =
    subscription?.status === "PAST_DUE" || subscription?.status === "CANCELING"
      ? subscription.status
      : "ACTIVE";
  const format = await getFormatter();
  // Waffo sends the period end as a date, so it is shown as a UTC date.
  const periodEnd =
    subscription?.currentPeriodEnd &&
    format.dateTime(new Date(subscription.currentPeriodEnd), {
      dateStyle: "medium",
      timeZone: "UTC",
    });
  const columns = [
    "date",
    "pack",
    "amount",
    "creditsColumn",
    "status",
  ] as const;
  return (
    <main className="mx-auto w-full max-w-310 space-y-8 px-5 py-8 md:space-y-12 md:py-16">
      <h1 className="font-heading text-[28px] font-bold tracking-tight md:text-4xl">
        {t("title")}
      </h1>
      {checkout && <CheckoutStatus paid={checkout.paid} />}
      <section
        aria-labelledby="credits-label"
        className="flex flex-col gap-6 rounded-lg bg-surface px-6 py-6 md:flex-row md:items-center md:justify-between md:px-8"
      >
        <div className="space-y-1">
          <h2
            id="credits-label"
            className="text-xs font-semibold tracking-[1px] text-muted-foreground uppercase"
          >
            {t("credits")}
          </h2>
          <p className="flex items-baseline gap-2">
            <span
              data-testid="billing-balance"
              className="font-heading text-4xl font-bold tabular-nums"
            >
              {balance}
            </span>
            <span className="text-[15px] text-muted-foreground">
              {t("available")}
            </span>
          </p>
        </div>
        <Button asChild variant="outline" className="h-10 px-4">
          <Link href="/pricing">
            <Coins aria-hidden="true" />
            {t("buyCredits")}
          </Link>
        </Button>
      </section>
      {subscription && (
        <section
          aria-labelledby="subscription-label"
          data-testid="subscription"
          className="flex flex-col gap-6 rounded-lg border border-border px-6 py-6 md:flex-row md:items-center md:justify-between md:px-8"
        >
          <div className="space-y-2">
            <h2
              id="subscription-label"
              className="text-xs font-semibold tracking-[1px] text-muted-foreground uppercase"
            >
              {t("subscription.title")}
            </h2>
            <p className="flex flex-wrap items-center gap-3">
              <span className="font-heading text-2xl font-semibold">
                {tp(`plan.${subscription.planId as SubscriptionPlanId}`)}
              </span>
              <SubscriptionStatus status={shownStatus} />
            </p>
            {periodEnd && shownStatus !== "PAST_DUE" && (
              <p className="text-[15px] text-muted-foreground">
                {t(
                  shownStatus === "CANCELING"
                    ? "subscription.endsOn"
                    : "subscription.renewsOn",
                  { date: periodEnd },
                )}
              </p>
            )}
            {shownStatus === "PAST_DUE" && (
              <p className="max-w-xl text-[15px] text-muted-foreground">
                {t("subscription.pastDue")}{" "}
                <a
                  href={billing.customerPortalUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold text-foreground underline underline-offset-4"
                >
                  {t("subscription.updatePayment")}
                </a>
              </p>
            )}
          </div>
          {(subscription.status === "ACTIVE" ||
            subscription.status === "PAST_DUE") && <CancelSubscription />}
        </section>
      )}
      <section className="space-y-4" aria-labelledby="activity-label">
        <h2 id="activity-label" className="font-heading text-2xl font-semibold">
          {t("activity.title")}
        </h2>
        {/* Remount when the checkout refresh brings a new entry. */}
        <CreditActivity
          key={activity.transactions[0]?.id}
          initial={activity.transactions}
          initialCursor={activity.nextCursor}
        />
      </section>
      <section className="space-y-4" aria-labelledby="history-label">
        <h2 id="history-label" className="font-heading text-2xl font-semibold">
          {t("history")}
        </h2>
        {purchases.length === 0 ? (
          <p className="text-[15px] text-muted-foreground">{t("empty")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-140 text-left text-sm">
              <thead className="text-xs font-semibold tracking-[1px] text-muted-foreground uppercase">
                <tr className="border-b border-border">
                  {columns.map((c) => (
                    <th key={c} scope="col" className="py-3 pr-4 font-semibold">
                      {t(c)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {purchases.map((p) => (
                  <tr
                    key={p.id}
                    data-testid="purchase-row"
                    className="border-b border-border"
                  >
                    <td className="py-3.5 pr-4">
                      <LocalDateTime iso={p.createdAt} />
                    </td>
                    <td className="py-3.5 pr-4">
                      {tp(`pack.${p.packId as CreditPackId}`)}
                    </td>
                    <td className="py-3.5 pr-4 tabular-nums">
                      {formatUsd(p.amountUsd, { cents: true })}
                    </td>
                    <td className="py-3.5 pr-4 tabular-nums">{p.credits}</td>
                    <td className="py-3.5">
                      <PurchaseStatus status={p.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
