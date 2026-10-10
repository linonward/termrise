import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";

import type { ExecutionDetailDto } from "@repo/execution/execution-dto";

import {
  DeleteRecord,
  EventForm,
  ProductForm,
  RevenueForm,
} from "@/features/products/product-forms";
import { ProductStatus, SourceBadge } from "@/features/products/product-status";
import { apiRequest } from "@/server/api/api";

async function loadProduct(id: string) {
  const response = await apiRequest(
    `/api/execution/projects/${encodeURIComponent(id)}`,
  );
  if (response.status === 404) notFound();
  if (!response.ok)
    throw new Error(`API /api/execution/projects failed: ${response.status}`);
  return (await response.json()) as ExecutionDetailDto;
}

export async function generateMetadata({
  params,
}: PageProps<"/projects/[id]">) {
  return { title: (await loadProduct((await params).id)).name };
}

// One product: status, launch, visitors and revenue as recorded (docs/product/ux.md#products).
export default async function ProductPage({
  params,
}: PageProps<"/projects/[id]">) {
  const p = await loadProduct((await params).id);
  const t = await getTranslations("products");
  const format = await getFormatter();
  const money = (value: number | null, currency: string) =>
    value === null ? (
      <span className="text-subtle-foreground">{t("unknown")}</span>
    ) : (
      format.number(value, { style: "currency", currency })
    );
  const base = `/api/execution/projects/${p.id}`;
  return (
    <main className="mx-auto w-full max-w-310 space-y-8 px-5 py-8 md:space-y-10 md:py-16">
      <header className="space-y-4">
        <Link
          href="/projects"
          className="flex w-fit items-center gap-1 text-[15px] font-medium"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          {t("back")}
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-heading text-[28px] font-bold tracking-tight break-words md:text-4xl">
            {p.name}
          </h1>
          <ProductStatus status={p.status} />
        </div>
        {p.opportunityId && (
          <Link
            href={`/opportunities/${p.opportunityId}`}
            className="w-fit text-[15px] font-medium underline underline-offset-4"
          >
            {t("opportunityLink")}
          </Link>
        )}
      </header>
      <div className="flex flex-col gap-8 md:flex-row md:items-start md:gap-12">
        <section
          aria-labelledby="results-title"
          className="min-w-0 flex-1 space-y-4"
        >
          <h2
            id="results-title"
            className="font-heading text-2xl font-semibold"
          >
            {t("resultsTitle")}
          </h2>
          <dl className="grid grid-cols-2 gap-4 rounded-lg bg-surface p-6">
            {(
              [
                ["visitors", p.totals.visitors],
                ["activations", p.totals.activations],
              ] as const
            ).map(([key, value]) => (
              <div key={key} className="space-y-1">
                <dt className="text-xs font-semibold tracking-[1px] text-muted-foreground uppercase">
                  {t(`metric.${key}`)}
                </dt>
                <dd
                  className="font-heading text-2xl font-semibold tabular-nums"
                  data-testid={`total-${key}`}
                >
                  {format.number(value)}
                </dd>
              </div>
            ))}
          </dl>
          {p.totals.revenue.length === 0 ? (
            <div className="rounded-lg border border-border p-6 text-[15px] text-muted-foreground">
              {t("revenueEmpty")}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[15px]">
                <thead>
                  <tr className="border-b border-border text-xs font-semibold tracking-[1px] text-muted-foreground uppercase">
                    {(
                      [
                        "currency",
                        "orders",
                        "verified",
                        "gross",
                        "refund",
                        "fees",
                        "net",
                      ] as const
                    ).map((key) => (
                      <th
                        key={key}
                        className={
                          key === "currency"
                            ? "pr-4 pb-3 font-semibold"
                            : "pr-4 pb-3 text-right font-semibold"
                        }
                      >
                        {t(`total.${key}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {p.totals.revenue.map((r) => (
                    <tr
                      key={r.currency}
                      data-testid="revenue-total"
                      className="border-b border-border"
                    >
                      <td className="py-3.5 pr-4 font-semibold">
                        {r.currency}
                      </td>
                      <td className="py-3.5 pr-4 text-right tabular-nums">
                        {r.orders}
                      </td>
                      <td className="py-3.5 pr-4 text-right tabular-nums">
                        {r.verifiedOrders}
                      </td>
                      <td className="py-3.5 pr-4 text-right whitespace-nowrap tabular-nums">
                        {money(r.gross, r.currency)}
                      </td>
                      <td className="py-3.5 pr-4 text-right whitespace-nowrap tabular-nums">
                        {money(r.refund, r.currency)}
                      </td>
                      <td className="py-3.5 pr-4 text-right whitespace-nowrap tabular-nums">
                        {money(r.fees, r.currency)}
                      </td>
                      <td className="py-3.5 pr-4 text-right font-semibold whitespace-nowrap tabular-nums">
                        {money(r.net, r.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-[13px] text-muted-foreground">{t("totalsNote")}</p>
        </section>
        <section
          aria-labelledby="product-title"
          className="space-y-5 rounded-lg border border-border p-6 md:w-100"
        >
          <h2 id="product-title" className="font-heading text-xl font-semibold">
            {t("productTitle")}
          </h2>
          <ProductForm product={p} />
        </section>
      </div>
      <div className="flex flex-col gap-8 md:flex-row md:items-start md:gap-12">
        <section
          aria-labelledby="revenue-title"
          className="min-w-0 flex-1 space-y-4"
        >
          <h2
            id="revenue-title"
            className="font-heading text-2xl font-semibold"
          >
            {t("revenueTitle")}
          </h2>
          {p.revenue.length > 0 && (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {p.revenue.map((r) => (
                <li
                  key={r.id}
                  data-testid="revenue-row"
                  className="flex flex-wrap items-start justify-between gap-3 px-6 py-4 text-[15px]"
                >
                  <div className="space-y-1">
                    <p className="font-medium">
                      {r.occurredOn} · {t("ordersCount", { count: r.orders })} ·{" "}
                      {money(r.gross, r.currency)}
                    </p>
                    <p className="text-[13px] text-muted-foreground">
                      {t("total.refund")} {money(r.refund, r.currency)} ·{" "}
                      {t("total.fees")} {money(r.fees, r.currency)}
                      {r.evidence && ` · ${r.evidence}`}
                    </p>
                    <SourceBadge source={r.source} />
                  </div>
                  {r.source === "manual" && (
                    <DeleteRecord path={`${base}/revenue/${r.id}`} />
                  )}
                </li>
              ))}
            </ul>
          )}
          <details className="rounded-lg border border-border">
            <summary className="cursor-pointer px-6 py-4 text-[15px] font-semibold">
              {t("addRevenue")}
            </summary>
            <div className="border-t border-border p-6">
              <RevenueForm productId={p.id} />
            </div>
          </details>
        </section>
        <section aria-labelledby="events-title" className="space-y-4 md:w-100">
          <h2 id="events-title" className="font-heading text-2xl font-semibold">
            {t("eventsTitle")}
          </h2>
          {p.events.length > 0 && (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {p.events.map((e) => (
                <li
                  key={e.id}
                  data-testid="event-row"
                  className="flex items-start justify-between gap-3 px-6 py-4 text-[15px]"
                >
                  <div className="space-y-1">
                    <p className="font-medium">
                      {t(`metric.${e.metric}`)}: {format.number(e.count)}
                    </p>
                    <p className="text-[13px] text-muted-foreground tabular-nums">
                      {e.periodStart} – {e.periodEnd}
                    </p>
                    <SourceBadge source={e.source} />
                  </div>
                  {e.source === "manual" && (
                    <DeleteRecord path={`${base}/events/${e.id}`} />
                  )}
                </li>
              ))}
            </ul>
          )}
          <details className="rounded-lg border border-border">
            <summary className="cursor-pointer px-6 py-4 text-[15px] font-semibold">
              {t("addEvent")}
            </summary>
            <div className="border-t border-border p-6">
              <EventForm productId={p.id} />
            </div>
          </details>
        </section>
      </div>
    </main>
  );
}
