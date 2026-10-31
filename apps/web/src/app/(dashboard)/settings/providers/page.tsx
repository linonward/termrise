import { CircleCheck, CircleDashed, CircleX, Hourglass } from "lucide-react";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import type { ProviderStatusDto } from "@repo/research/provider-status";
import { Badge as UiBadge } from "@repo/ui/components/badge";
import { cn } from "@repo/ui/utils";

import { EmptyState } from "@/components/empty-state";
import { LocalDateTime } from "@/components/local-date-time";
import { BudgetUsage } from "@/features/settings/budget-usage";
import { apiGet } from "@/server/api/api";

export async function generateMetadata() {
  return { title: (await getTranslations("providers"))("metaTitle") };
}

const KNOWN = ["fake", "dataforseo", "deepseek"] as const;
type Known = (typeof KNOWN)[number];
const known = (provider: string): Known | undefined =>
  KNOWN.find((k) => k === provider);

// Status badges (docs/design/design-system.md#status); destructive is Danger.
function Badge({
  tone,
  children,
}: {
  tone: "success" | "destructive" | "info" | "neutral";
  children: ReactNode;
}) {
  return tone === "success" ? (
    <UiBadge tone="success" icon={CircleCheck}>
      {children}
    </UiBadge>
  ) : tone === "destructive" ? (
    <UiBadge tone="danger" icon={CircleX}>
      {children}
    </UiBadge>
  ) : tone === "info" ? (
    <UiBadge tone="info" icon={Hourglass}>
      {children}
    </UiBadge>
  ) : (
    <UiBadge tone="neutral" icon={CircleDashed}>
      {children}
    </UiBadge>
  );
}

// The services the worker runs and what the user's projects spent on each provider
// (docs/product/ux.md#provider-settings).
export default async function ProvidersPage() {
  const t = await getTranslations("providers");
  const format = await getFormatter();
  const status = await apiGet<ProviderStatusDto>("/api/settings/providers");
  const { worker, radar, usage } = status;
  const name = (provider: string) => {
    const k = known(provider);
    return k ? t(`provider.${k}`) : provider;
  };
  const money = (usd: number) =>
    format.number(usd, {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 4,
    });
  const services: [
    "worker" | "keywords" | "analyst" | "radar",
    ReactNode,
    ReactNode,
  ][] = [
    [
      "worker",
      worker ? (
        <Badge tone={worker.online ? "success" : "destructive"}>
          {t(worker.online ? "online" : "offline")}
        </Badge>
      ) : (
        <Badge tone="neutral">{t("notStarted")}</Badge>
      ),
      worker && (
        <>
          {t("lastSeen")} <LocalDateTime iso={worker.lastSeenAt} />
        </>
      ),
    ],
    [
      "keywords",
      worker ? name(worker.keywordProvider) : "—",
      worker?.keywordProvider === "fake" && t("fakeNote"),
    ],
    [
      "analyst",
      worker
        ? [name(worker.analystProvider), worker.analystModel]
            .filter(Boolean)
            .join(" · ")
        : "—",
      worker?.analystProvider === "fake" && t("fakeNote"),
    ],
    [
      "radar",
      worker?.radarSources.length
        ? t("radarOn", {
            sources: worker.radarSources
              .map((s) =>
                s === "hacker_news" || s === "google_trends"
                  ? t(`radarSource.${s}`)
                  : s,
              )
              .join(", "),
          })
        : t("radarOff"),
      radar.lastCollectedAt ? (
        <>
          {t("radarItems", { count: radar.items })} · {t("lastCollected")}{" "}
          <LocalDateTime iso={radar.lastCollectedAt} />
        </>
      ) : (
        t("radarNever")
      ),
    ],
  ];
  return (
    <main className="mx-auto w-full max-w-310 space-y-8 px-5 py-8 md:space-y-12 md:py-16">
      <header className="space-y-2">
        <h1 className="font-heading text-[28px] font-semibold tracking-tight md:text-4xl">
          {t("title")}
        </h1>
        <p className="text-[15px] text-muted-foreground">{t("subtitle")}</p>
      </header>
      <section aria-labelledby="services-title" className="space-y-4">
        <h2 id="services-title" className="font-heading text-2xl font-semibold">
          {t("services")}
        </h2>
        <dl className="divide-y divide-border rounded-lg border border-border">
          {services.map(([key, value, note]) => (
            <div
              key={key}
              data-testid={`service-${key}`}
              className="flex flex-col gap-1 p-4 md:flex-row md:items-center md:gap-6 md:px-6"
            >
              <dt className="text-[15px] font-medium md:w-48">
                {t(`service.${key}`)}
              </dt>
              <dd className="text-[15px]">{value}</dd>
              {note && (
                <dd className="text-[13px] text-muted-foreground md:ml-auto">
                  {note}
                </dd>
              )}
            </div>
          ))}
        </dl>
        <p className="text-[13px] text-muted-foreground">{t("keysNote")}</p>
      </section>
      <BudgetUsage status={status} />
      <section aria-labelledby="usage-title" className="space-y-4">
        <h2 id="usage-title" className="font-heading text-2xl font-semibold">
          {t("usage")}
        </h2>
        {usage.length === 0 ? (
          <EmptyState body={t("usageEmpty")} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[15px]">
              <thead>
                <tr className="border-b border-border text-xs font-semibold tracking-[1px] text-muted-foreground uppercase">
                  {(
                    [
                      "provider",
                      "budget",
                      "calls",
                      "failed",
                      "spent",
                      "held",
                      "lastCall",
                    ] as const
                  ).map((key) => (
                    <th
                      key={key}
                      className={cn(
                        "pr-4 pb-3 font-semibold",
                        ["calls", "failed", "spent", "held"].includes(key) &&
                          "text-right",
                      )}
                    >
                      {t(`column.${key}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {usage.map((u) => (
                  <tr
                    key={`${u.kind}-${u.provider}`}
                    data-testid="usage-row"
                    className="border-b border-border"
                  >
                    <td className="py-4 pr-4 font-semibold">
                      {name(u.provider)}
                    </td>
                    <td className="py-4 pr-4 text-muted-foreground">
                      {t(`kind.${u.kind}`)}
                    </td>
                    <td className="py-4 pr-4 text-right font-mono text-sm font-medium tabular-nums">
                      {u.calls}
                    </td>
                    <td className="py-4 pr-4 text-right font-mono text-sm font-medium tabular-nums">
                      {u.failed}
                    </td>
                    <td className="py-4 pr-4 text-right font-mono text-sm font-medium tabular-nums">
                      {money(u.spentUsd)}
                    </td>
                    <td className="py-4 pr-4 text-right font-mono text-sm font-medium tabular-nums">
                      {money(u.heldUsd)}
                    </td>
                    <td className="py-4 pr-4">
                      <div className="flex flex-wrap items-center gap-2 whitespace-nowrap">
                        <Badge
                          tone={
                            u.lastStatus === "settled"
                              ? "success"
                              : u.lastStatus === "failed" ||
                                  u.lastStatus === "released"
                                ? "destructive"
                                : "info"
                          }
                        >
                          {t(`lastStatus.${u.lastStatus}`)}
                        </Badge>
                        <span className="text-muted-foreground">
                          <LocalDateTime iso={u.lastCallAt} />
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[13px] text-muted-foreground">
          {t("budgetNote")}{" "}
          <Link
            href="/opportunities/research"
            className="font-semibold text-foreground underline underline-offset-4"
          >
            {t("budgetLink")}
          </Link>
        </p>
      </section>
    </main>
  );
}
