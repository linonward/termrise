import { getFormatter, getTranslations } from "next-intl/server";

import type { SiteSummaryDto } from "./site-dto";

// A site's three headline numbers: visitors 7 days, Google 28 days, orders 30 days.
// Shown on the site page and on a product whose domain is the site (S82).
export async function SiteStats({ summary }: { summary: SiteSummaryDto }) {
  const t = await getTranslations("sites");
  const format = await getFormatter();
  const n = (v: number | null) => (v == null ? "—" : format.number(v));
  return (
    <section className="grid gap-4 md:grid-cols-3" data-testid="site-stats">
      <div className="rounded-lg bg-surface px-6 py-5">
        <h2 className="text-xs font-semibold tracking-[1px] text-muted-foreground uppercase">
          {t("statVisitors")}
        </h2>
        <p className="font-heading text-3xl font-semibold tabular-nums">
          {n(summary.visitors7d)}
        </p>
      </div>
      <div className="rounded-lg bg-surface px-6 py-5">
        <h2 className="text-xs font-semibold tracking-[1px] text-muted-foreground uppercase">
          {t("statSearch")}
        </h2>
        <p className="font-heading text-3xl font-semibold tabular-nums">
          {summary.search ? n(summary.search.clicks) : "—"}
        </p>
        {summary.search && (
          <p className="text-[13px] text-muted-foreground">
            {t("searchDetail", {
              impressions: format.number(summary.search.impressions),
              position:
                summary.search.position === null
                  ? "—"
                  : format.number(summary.search.position, {
                      maximumFractionDigits: 1,
                    }),
            })}
          </p>
        )}
      </div>
      <div className="rounded-lg bg-surface px-6 py-5">
        <h2 className="text-xs font-semibold tracking-[1px] text-muted-foreground uppercase">
          {t("statOrders")}
        </h2>
        <p className="font-heading text-3xl font-semibold tabular-nums">
          {n(summary.orders30d)}
        </p>
        {summary.revenue30d.length > 0 && (
          <p className="text-[13px] text-muted-foreground tabular-nums">
            {summary.revenue30d
              .map((r) =>
                format.number(r.amountMinor / 100, {
                  style: "currency",
                  currency: r.currency,
                }),
              )
              .join(" + ")}
          </p>
        )}
      </div>
    </section>
  );
}
