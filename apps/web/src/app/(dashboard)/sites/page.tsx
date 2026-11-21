import { Globe } from "lucide-react";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";

import { EmptyState } from "@/components/empty-state";
import { LocalDateTime } from "@/components/local-date-time";
import { SectionHeader } from "@/components/section-header";
import {
  uptimePercent,
  type HeartbeatDto,
  type SiteDto,
} from "@/features/sites/site-dto";
import { SiteState } from "@/features/sites/site-state";
import { apiGet } from "@/server/api/api";

export async function generateMetadata() {
  return { title: (await getTranslations("sites"))("metaTitle") };
}

// The maintainer's live sites, copied from site-ops every 15 minutes (docs/product/ux.md#sites).
export default async function SitesPage() {
  const t = await getTranslations("sites");
  const format = await getFormatter();
  const { items, heartbeats } = await apiGet<{
    items: SiteDto[];
    heartbeats: HeartbeatDto[];
  }>("/api/sites");
  const down = items.filter((s) => s.alertState === "down");
  const synced = items.reduce<string | null>(
    (latest, s) => (!latest || s.syncedAt > latest ? s.syncedAt : latest),
    null,
  );
  const n = (v: number | null) => (v === null ? "—" : format.number(v));
  const money = (r: SiteDto["summary"]["revenue30d"]) =>
    r.length
      ? r
          .map((x) =>
            format.number(x.amountMinor / 100, {
              style: "currency",
              currency: x.currency,
            }),
          )
          .join(" + ")
      : "—";

  return (
    <main className="mx-auto w-full max-w-310 space-y-8 px-5 py-8 md:space-y-12 md:py-16">
      <SectionHeader section="fleet" current="sites">
        <div className="space-y-2">
          <p className="text-[15px] text-muted-foreground">
            {synced ? (
              <>
                {t("subtitle", { count: items.length, down: down.length })}{" "}
                {t("syncedAt")} <LocalDateTime iso={synced} />
              </>
            ) : (
              t("subtitleEmpty")
            )}
          </p>
          {heartbeats.map((h) => (
            <p
              key={h.source}
              data-testid={`heartbeat-${h.source}`}
              className="text-[13px] text-muted-foreground"
            >
              {t("heartbeat", { source: h.source })}{" "}
              {h.state === "up"
                ? t("heartbeatUp")
                : t("heartbeatDown", { reason: h.reason })}
            </p>
          ))}
        </div>
      </SectionHeader>
      {items.length === 0 ? (
        <EmptyState
          icon={Globe}
          title={t("emptyTitle")}
          body={t("emptyBody")}
        />
      ) : (
        <div className="overflow-x-auto">
          {/* On a phone each row is a two-column block: site and state, then the numbers
              with their labels; from md up it is the table (S92). */}
          <table className="block w-full text-left text-[15px] md:table">
            <thead className="hidden text-[13px] text-muted-foreground md:table-header-group">
              <tr className="border-b border-border">
                <th className="py-2 pr-4 font-medium">{t("colSite")}</th>
                <th className="py-2 pr-4 font-medium">{t("colState")}</th>
                <th className="py-2 pr-4 text-right font-medium">
                  {t("colVisitors")}
                </th>
                <th className="py-2 pr-4 text-right font-medium">
                  {t("colSearch")}
                </th>
                <th className="py-2 pr-4 text-right font-medium">
                  {t("colOrders")}
                </th>
                <th className="py-2 font-medium">{t("colTemplate")}</th>
              </tr>
            </thead>
            <tbody className="block md:table-row-group">
              {items.map((s) => {
                const up = uptimePercent(s.uptime24h);
                return (
                  <tr
                    key={s.domain}
                    data-testid="site-row"
                    className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 border-b border-border py-3 align-top md:table-row md:py-0"
                  >
                    <td className="md:table-cell md:py-3 md:pr-4">
                      <Link
                        href={`/sites/${s.domain}`}
                        className="font-medium hover:underline"
                      >
                        {s.name}
                      </Link>
                      <div className="text-[13px] text-muted-foreground">
                        {s.domain}
                      </div>
                    </td>
                    <td className="text-right md:table-cell md:py-3 md:pr-4 md:text-left">
                      <SiteState state={s.alertState} />
                      <div className="mt-1 text-[13px] text-muted-foreground tabular-nums">
                        {up === null ? "—" : t("uptime", { percent: up })}
                      </div>
                    </td>
                    <td className="col-span-2 text-[13px] tabular-nums md:table-cell md:py-3 md:pr-4 md:text-right md:text-[15px]">
                      <span className="text-muted-foreground md:hidden">
                        {t("colVisitors")}{" "}
                      </span>
                      {n(s.summary.visitors7d)}
                    </td>
                    <td className="col-span-2 text-[13px] tabular-nums md:table-cell md:py-3 md:pr-4 md:text-right md:text-[15px]">
                      <span className="text-muted-foreground md:hidden">
                        {t("colSearch")}{" "}
                      </span>
                      {s.summary.search
                        ? t("searchLine", {
                            clicks: s.summary.search.clicks,
                            impressions: format.number(
                              s.summary.search.impressions,
                            ),
                          })
                        : "—"}
                    </td>
                    <td className="col-span-2 text-[13px] tabular-nums md:table-cell md:py-3 md:pr-4 md:text-right md:text-[15px]">
                      <span className="text-muted-foreground md:hidden">
                        {t("colOrders")}{" "}
                      </span>
                      {s.summary.orders30d === null
                        ? "—"
                        : s.summary.revenue30d.length
                          ? `${n(s.summary.orders30d)} · ${money(s.summary.revenue30d)}`
                          : n(s.summary.orders30d)}
                    </td>
                    <td className="hidden py-3 align-top text-[13px] text-muted-foreground md:table-cell">
                      {s.template ?? "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-3 text-[13px] text-muted-foreground">
            {t("columnsNote")}
          </p>
        </div>
      )}
    </main>
  );
}
