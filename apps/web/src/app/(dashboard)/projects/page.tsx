import Link from "next/link";
import { getTranslations } from "next-intl/server";

import type { ExecutionProjectDto } from "@repo/execution/execution-dto";

import { LocalDateTime } from "@/components/local-date-time";
import { ProductStatus } from "@/features/products/product-status";
import { apiGet } from "@/server/api/api";

export async function generateMetadata() {
  return { title: (await getTranslations("products"))("metaTitle") };
}

// Products started from Go opportunities (docs/product/ux.md#products).
export default async function ProductsPage() {
  const t = await getTranslations("products");
  const { items } = await apiGet<{ items: ExecutionProjectDto[] }>(
    "/api/execution/projects",
  );
  return (
    <main className="mx-auto w-full max-w-310 space-y-8 px-5 py-8 md:space-y-12 md:py-16">
      <header className="space-y-2">
        <h1 className="font-heading text-[28px] font-bold tracking-tight md:text-4xl">
          {t("title")}
        </h1>
        <p className="text-[15px] text-muted-foreground">{t("subtitle")}</p>
      </header>
      {items.length === 0 ? (
        <div className="space-y-1 rounded-lg border border-border p-6">
          <p className="text-[15px] font-medium">{t("emptyTitle")}</p>
          <p className="text-[15px] text-muted-foreground">
            {t("emptyBody")}{" "}
            <Link
              href="/opportunities"
              className="font-semibold text-foreground underline underline-offset-4"
            >
              {t("emptyLink")}
            </Link>
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[15px]">
            <thead>
              <tr className="border-b border-border text-xs font-semibold tracking-[1px] text-muted-foreground uppercase">
                {(
                  ["name", "status", "domain", "launched", "created"] as const
                ).map((key) => (
                  <th key={key} className="pr-4 pb-3 font-semibold">
                    {t(`column.${key}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr
                  key={p.id}
                  data-testid="product-row"
                  className="border-b border-border"
                >
                  <td className="py-4 pr-4 font-semibold">
                    <Link
                      href={`/projects/${p.id}`}
                      className="hover:underline hover:underline-offset-4"
                    >
                      {p.name}
                    </Link>
                  </td>
                  <td className="py-4 pr-4">
                    <ProductStatus status={p.status} />
                  </td>
                  <td className="py-4 pr-4 text-muted-foreground">
                    {p.domain ?? t("none")}
                  </td>
                  <td className="py-4 pr-4 whitespace-nowrap text-muted-foreground tabular-nums">
                    {p.launchedOn ?? t("none")}
                  </td>
                  <td className="py-4 pr-4 whitespace-nowrap text-muted-foreground">
                    <LocalDateTime iso={p.createdAt} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
