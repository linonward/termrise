import Link from "next/link";
import { getTranslations } from "next-intl/server";

import type { ProviderStatusDto } from "@repo/research/provider-status";

const usd = (n: number | undefined) => `$${(n ?? 0).toFixed(2)}`;

// What each budget has used against its cap (docs/product/ux.md#provider-settings): the
// caps come from the worker's heartbeat, the use from the budget ledger.
export async function BudgetUsage({ status }: { status: ProviderStatusDto }) {
  const t = await getTranslations("providers.budgets");
  const b = status.worker?.budgets ?? null;
  const spend = (
    bucket: "evergreen" | "new_words" | "platform",
    kind: "data" | "ai",
  ) => status.poolSpend.find((p) => p.bucket === bucket && p.kind === kind);
  const rows: {
    name: string;
    schedule: string;
    today: string;
    month: string;
  }[] = [
    {
      name: t("newWords"),
      schedule: b
        ? b.newWords.enabled
          ? t("newWordsOn", {
              hours: b.newWords.scanHours ?? 24,
              screens: b.newWords.screens ?? b.newWords.checks,
              checks: b.newWords.checks,
            })
          : t("off")
        : "—",
      today: b
        ? t("todayDataAi", {
            data: usd(spend("new_words", "data")?.todayUsd),
            dataCap: usd(b.newWords.dailyData),
            ai: usd(spend("new_words", "ai")?.todayUsd),
            aiCap: usd(b.newWords.dailyAi),
          })
        : "—",
      month: usd(
        (spend("new_words", "data")?.monthUsd ?? 0) +
          (spend("new_words", "ai")?.monthUsd ?? 0),
      ),
    },
    {
      name: t("evergreen"),
      schedule: b
        ? b.evergreen.enabled
          ? b.evergreen.everyDays === 1
            ? t("daily")
            : t("everyDays", { days: b.evergreen.everyDays })
          : t("off")
        : "—",
      today: b
        ? b.evergreen.dailyAi != null
          ? t("todayDataAi", {
              data: usd(spend("evergreen", "data")?.todayUsd),
              dataCap: usd(b.evergreen.dailyData),
              ai: usd(spend("evergreen", "ai")?.todayUsd),
              aiCap: usd(b.evergreen.dailyAi),
            })
          : t("todayData", {
              data: usd(spend("evergreen", "data")?.todayUsd),
              dataCap: usd(b.evergreen.dailyData),
            })
        : "—",
      month: usd(
        (spend("evergreen", "data")?.monthUsd ?? 0) +
          (spend("evergreen", "ai")?.monthUsd ?? 0),
      ),
    },
    {
      name: t("platform"),
      schedule: b?.platform
        ? b.platform.enabled
          ? t("platformOn", { batch: b.platform.batch })
          : t("off")
        : "—",
      today: b?.platform
        ? t("todayData", {
            data: usd(spend("platform", "data")?.todayUsd),
            dataCap: usd(b.platform.dailyData),
          })
        : "—",
      month: usd(spend("platform", "data")?.monthUsd),
    },
  ];
  return (
    <section aria-labelledby="budgets-title" className="space-y-4">
      <h2 id="budgets-title" className="font-heading text-2xl font-semibold">
        {t("title")}
      </h2>
      <p className="text-[15px]" data-testid="monthly-budget">
        {b
          ? t("monthly", {
              data: usd(status.monthUsd.data),
              dataCap: usd(b.monthly.data),
              ai: usd(status.monthUsd.ai),
              aiCap: usd(b.monthly.ai),
            })
          : t("noWorker")}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[15px]">
          <thead>
            <tr className="border-b border-border text-xs font-semibold tracking-[1px] text-muted-foreground uppercase">
              {(["budget", "schedule", "today", "month"] as const).map(
                (key) => (
                  <th key={key} className="pr-4 pb-3 font-semibold">
                    {t(`column.${key}`)}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name} className="border-b border-border">
                <td className="py-3 pr-4 font-semibold">{r.name}</td>
                <td className="py-3 pr-4">{r.schedule}</td>
                <td className="py-3 pr-4 font-mono text-sm tabular-nums">
                  {r.today}
                </td>
                <td className="py-3 pr-4 font-mono text-sm tabular-nums">
                  {r.month}
                </td>
              </tr>
            ))}
            <tr className="border-b border-border">
              <td className="py-3 pr-4 font-semibold">{t("research")}</td>
              <td className="py-3 pr-4" colSpan={3}>
                {t("researchNote")}{" "}
                <Link
                  href="/opportunities/research"
                  className="underline underline-offset-4"
                >
                  {t("researchLink")}
                </Link>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-[13px] text-muted-foreground">{t("note")}</p>
    </section>
  );
}
