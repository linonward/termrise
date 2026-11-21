import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";

import { LocalDateTime } from "@/components/local-date-time";
import { SectionHeader } from "@/components/section-header";
import { type ExpenseItem, Expenses } from "@/features/settings/expenses";
import { apiGet } from "@/server/api/api";

type Month = {
  month: string;
  items: ExpenseItem[];
  totals: { currency: string; amountMinor: number }[];
};
type Domain = {
  domain: string;
  expiresAt: string | null;
  daysLeft: number | null;
  registrar: string | null;
  checkedAt: string;
  error: string | null;
};

export async function generateMetadata() {
  return { title: (await getTranslations("expenses"))("metaTitle") };
}

const shift = (month: string, by: number) => {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return d.toISOString().slice(0, 7);
};

// Payments and domain renewals (docs/product/ux.md#expenses).
export default async function ExpensesPage({
  searchParams,
}: PageProps<"/settings/expenses">) {
  const { month: asked } = await searchParams;
  const t = await getTranslations("expenses");
  const format = await getFormatter();
  const query =
    typeof asked === "string" && /^\d{4}-\d{2}$/.test(asked)
      ? `?month=${asked}`
      : "";
  const [m, { items: domains }] = await Promise.all([
    apiGet<Month>(`/api/expenses${query}`),
    apiGet<{ items: Domain[] }>("/api/sites/domains"),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const total = m.totals.length
    ? m.totals
        .map((x) =>
          format.number(x.amountMinor / 100, {
            style: "currency",
            currency: x.currency,
          }),
        )
        .join(" + ")
    : format.number(0, { style: "currency", currency: "USD" });

  return (
    <main className="mx-auto w-full max-w-310 space-y-10 px-5 py-8 md:py-12">
      <SectionHeader section="fleet" current="expenses">
        <div className="space-y-2">
          <p className="max-w-[65ch] text-[15px] text-muted-foreground">
            {t("subtitle")}{" "}
            <Link
              href="/settings/providers"
              className="underline underline-offset-4"
            >
              {t("apiLink")}
            </Link>
          </p>
        </div>
      </SectionHeader>

      <section aria-labelledby="month-title" className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <h2 id="month-title" className="font-heading text-xl font-semibold">
            {t("monthTitle", { month: m.month })}
          </h2>
          <nav className="flex gap-4 text-[13px] text-muted-foreground">
            <Link
              href={`/settings/expenses?month=${shift(m.month, -1)}`}
              className="hover:underline"
            >
              {t("prev")}
            </Link>
            <Link
              href={`/settings/expenses?month=${shift(m.month, 1)}`}
              className="hover:underline"
            >
              {t("next")}
            </Link>
          </nav>
        </div>
        <p className="text-[15px]" data-testid="expense-total">
          {t("monthTotal", { total })}
        </p>
        <Expenses items={m.items} today={today} />
      </section>

      <section aria-labelledby="domains-title" className="space-y-4">
        <h2 id="domains-title" className="font-heading text-xl font-semibold">
          {t("domainsTitle")}
        </h2>
        <p className="text-[13px] text-muted-foreground">{t("domainsNote")}</p>
        {domains.length === 0 ? (
          <p className="text-[15px] text-muted-foreground">
            {t("domainsEmpty")}
          </p>
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead className="text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="py-2 pr-4 font-medium">{t("colDomain")}</th>
                  <th className="py-2 pr-4 font-medium">{t("colExpires")}</th>
                  <th className="py-2 pr-4 text-right font-medium">
                    {t("colDaysLeft")}
                  </th>
                  <th className="py-2 pr-4 font-medium">{t("colRegistrar")}</th>
                  <th className="py-2 font-medium">{t("colChecked")}</th>
                </tr>
              </thead>
              <tbody>
                {domains.map((d) => (
                  <tr
                    key={d.domain}
                    className="border-b border-border"
                    data-testid="domain-row"
                  >
                    <td className="py-3 pr-4 text-[15px]">{d.domain}</td>
                    <td className="py-3 pr-4 whitespace-nowrap tabular-nums">
                      {d.expiresAt?.slice(0, 10) ?? "—"}
                    </td>
                    <td
                      className={`py-3 pr-4 text-right tabular-nums ${d.daysLeft !== null && d.daysLeft <= 30 ? "font-semibold text-destructive" : ""}`}
                    >
                      {d.daysLeft ?? "—"}
                    </td>
                    <td className="py-3 pr-4">{d.registrar ?? "—"}</td>
                    <td className="py-3 whitespace-nowrap text-muted-foreground">
                      <LocalDateTime iso={d.checkedAt} />
                      {d.error && ` · ${t("lookupFailed", { error: d.error })}`}
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
