import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";

import { LocalDateTime } from "@/components/local-date-time";
import {
  uptimePercent,
  type SiteDayDto,
  type SiteDto,
} from "@/features/sites/site-dto";
import { SiteState } from "@/features/sites/site-state";
import { SiteStats } from "@/features/sites/site-stats";
import { apiRequest } from "@/server/api/api";

type Detail = SiteDto & {
  removedAt: string | null;
  days: SiteDayDto[];
  product: {
    id: string;
    name: string;
    status: string;
    poolKeywordId: string | null;
    newWordId: string | null;
  } | null;
};

async function load(domain: string) {
  const response = await apiRequest(`/api/sites/${encodeURIComponent(domain)}`);
  if (response.status === 404) notFound();
  if (!response.ok)
    throw new Error(`API /api/sites failed: ${response.status}`);
  return (await response.json()) as Detail;
}

export async function generateMetadata({
  params,
}: PageProps<"/sites/[domain]">) {
  const { domain } = await params;
  return {
    title: (await getTranslations("sites"))("detailMetaTitle", { domain }),
  };
}

// One site's last 35 days as site-ops stored them (docs/product/ux.md#sites).
export default async function SitePage({
  params,
}: PageProps<"/sites/[domain]">) {
  const { domain } = await params;
  const site = await load(decodeURIComponent(domain));
  const t = await getTranslations("sites");
  const format = await getFormatter();
  const up = uptimePercent(site.uptime24h);
  const n = (v: number | undefined | null) =>
    v == null ? "—" : format.number(v);
  return (
    <main className="mx-auto w-full max-w-310 space-y-8 px-5 py-8 md:py-12">
      <Link
        href="/sites"
        className="text-[13px] text-muted-foreground hover:underline"
      >
        {t("back")}
      </Link>
      <header className="space-y-2">
        <h1 className="font-heading text-[28px] font-semibold tracking-tight md:text-4xl">
          {site.name}
        </h1>
        <p className="flex flex-wrap items-center gap-3 text-[15px] text-muted-foreground">
          <a
            href={`https://${site.domain}`}
            target="_blank"
            rel="noreferrer"
            className="hover:underline"
          >
            {site.domain}
          </a>
          <SiteState state={site.alertState} />
          <span className="tabular-nums">
            {up === null ? "—" : t("uptime", { percent: up })}
          </span>
          {site.lastCheckAt && (
            <span>
              {t("lastCheck")} <LocalDateTime iso={site.lastCheckAt} />
            </span>
          )}
        </p>
        {site.removedAt && (
          <p className="text-[13px] text-destructive">{t("removed")}</p>
        )}
      </header>
      {site.product && (
        <p className="text-[15px]" data-testid="site-product">
          {t("fromProduct")}{" "}
          <Link
            href={`/products/${site.product.id}`}
            className="font-medium underline underline-offset-4"
          >
            {site.product.name}
          </Link>
          {site.product.poolKeywordId && (
            <>
              {" · "}
              <Link
                href={`/keywords/${site.product.poolKeywordId}`}
                className="underline underline-offset-4"
              >
                {t("keywordRecord")}
              </Link>
            </>
          )}
          {site.product.newWordId && (
            <>
              {" · "}
              <Link
                href={`/discover/${site.product.newWordId}`}
                className="underline underline-offset-4"
              >
                {t("keywordRecord")}
              </Link>
            </>
          )}
        </p>
      )}
      <SiteStats summary={site.summary} />
      <section className="space-y-3">
        <h2 className="font-heading text-xl font-semibold">{t("daysTitle")}</h2>
        {site.days.length === 0 ? (
          <p className="text-[15px] text-muted-foreground">{t("daysEmpty")}</p>
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full text-left text-[15px]">
              <thead className="text-[13px] text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="py-2 pr-4 font-medium">{t("colDay")}</th>
                  <th className="py-2 pr-4 text-right font-medium">
                    {t("colDayVisitors")}
                  </th>
                  <th className="py-2 pr-4 text-right font-medium">
                    {t("colDayViews")}
                  </th>
                  <th className="py-2 pr-4 text-right font-medium">
                    {t("colDayClicks")}
                  </th>
                  <th className="py-2 pr-4 text-right font-medium">
                    {t("colDayImpressions")}
                  </th>
                  <th className="py-2 text-right font-medium">
                    {t("colDayOrders")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {site.days.map((d) => (
                  <tr
                    key={d.day}
                    data-testid="site-day"
                    className="border-b border-border tabular-nums"
                  >
                    <td className="py-2 pr-4 whitespace-nowrap tabular-nums">
                      {d.day}
                    </td>
                    <td className="py-2 pr-4 text-right">{n(d.pvuv?.uv)}</td>
                    <td className="py-2 pr-4 text-right">{n(d.pvuv?.pv)}</td>
                    <td className="py-2 pr-4 text-right">{n(d.gsc?.clicks)}</td>
                    <td className="py-2 pr-4 text-right">
                      {n(d.gsc?.impressions)}
                    </td>
                    <td className="py-2 text-right">
                      {n(d.admin?.orders?.paid)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-[13px] text-muted-foreground">
              {t("daysNote")}
            </p>
          </div>
        )}
      </section>
    </main>
  );
}
