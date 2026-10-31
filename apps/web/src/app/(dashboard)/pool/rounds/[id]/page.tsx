import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import type { PoolRoundDto } from "@repo/research/pool-dto";
import type { PoolRoundReport } from "@repo/research/pool-round";
import type { ScreenStatus } from "@repo/research/pool-rules";

import { LocalDateTime } from "@/components/local-date-time";
import { PoolStatusBadge, RoundStatusBadge } from "@/features/pool/pool-badges";
import { count, pct, usd } from "@/features/pool/pool-format";
import { apiGet } from "@/server/api/api";

const ROUND_ERRORS = [
  "DAILY_BUDGET_EXHAUSTED",
  "ROUND_TIMED_OUT",
  "ROUND_FAILED",
] as const;

export async function generateMetadata() {
  return { title: (await getTranslations("pool"))("reportTitle") };
}

// The report of one round: what it pulled, screened and checked (docs/product/keyword-pool.md#rounds).
export default async function PoolRoundPage({
  params,
}: PageProps<"/pool/rounds/[id]">) {
  const { id } = await params;
  const t = await getTranslations("pool");
  const round = await apiGet<PoolRoundDto>(`/api/pool/rounds/${id}`);
  const report = round.report as PoolRoundReport | null;

  return (
    <main className="mx-auto w-full max-w-310 space-y-10 px-5 py-8 md:py-16">
      <Link
        href="/pool"
        className="inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:underline"
      >
        <ChevronLeft aria-hidden="true" className="size-4" />
        {t("back")}
      </Link>
      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-heading text-[28px] font-semibold tracking-tight md:text-4xl">
            {t("reportTitle")}
          </h1>
          <RoundStatusBadge status={round.status} />
        </div>
        <p className="text-[15px] text-muted-foreground">
          {t(`roundKind.${round.kind}`)} ·{" "}
          {round.source ?? report?.source ?? t("roundNoSource")} ·{" "}
          <LocalDateTime iso={round.createdAt} /> ·{" "}
          {t("spent", { usd: usd(round.spentMicros, 3) })}
        </p>
        {round.errorCode && (
          <p role="note" className="text-[13px] text-warning">
            {ROUND_ERRORS.includes(
              round.errorCode as (typeof ROUND_ERRORS)[number],
            )
              ? t(
                  `roundError.${round.errorCode as (typeof ROUND_ERRORS)[number]}`,
                )
              : round.errorCode}
          </p>
        )}
      </header>
      {!report ? (
        <p className="text-[15px] text-muted-foreground">
          {t("reportPending")}
        </p>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-6 border-y border-border py-6 md:grid-cols-4">
            {(
              [
                ["pulled", report.pulled],
                ["added", report.added],
                ["deep", report.deep.length],
                [
                  "candidates",
                  report.deep.filter((d) => d.status === "candidate").length,
                ],
              ] as const
            ).map(([key, value]) => (
              <div key={key} className="space-y-1">
                <dt className="text-[13px] text-muted-foreground">
                  {t(`reportCount.${key}`)}
                </dt>
                <dd className="font-mono text-xl font-semibold tabular-nums">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
          <p className="text-[13px] text-muted-foreground">
            {Object.entries(report.screened)
              .map(([s, n]) => `${t(`screen.${s as ScreenStatus}`)} ${n}`)
              .join(" · ")}
          </p>
          <section aria-labelledby="deep-title" className="space-y-3">
            <h2 id="deep-title" className="font-heading text-xl font-semibold">
              {t("deepTitle")}
            </h2>
            {report.deep.length === 0 ? (
              <p className="text-[15px] text-muted-foreground">
                {t("deepEmpty")}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[15px]">
                  <thead>
                    <tr className="border-b border-border text-xs font-semibold tracking-[1px] text-muted-foreground uppercase">
                      {(
                        [
                          "keyword",
                          "status",
                          "volume",
                          "kd",
                          "cpc",
                          "strong",
                          "trend",
                          "variants",
                        ] as const
                      ).map((key) => (
                        <th key={key} className="pr-4 pb-3 font-semibold">
                          {t(`column.${key}`)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.deep.map((d) => (
                      <tr key={d.phrase} className="border-b border-border">
                        <td className="py-3 pr-4 font-semibold">
                          {d.phrase}
                          {d.from && d.from !== "queued" && (
                            <span className="ml-2 text-[13px] font-normal text-muted-foreground">
                              {t("recheck", { from: t(`status.${d.from}`) })}
                            </span>
                          )}
                        </td>
                        <td className="py-3 pr-4">
                          <PoolStatusBadge status={d.status} />
                        </td>
                        <td className="py-3 pr-4 font-mono text-sm tabular-nums">
                          {count(d.searchVolume)}
                        </td>
                        <td className="py-3 pr-4 font-mono text-sm tabular-nums">
                          {d.keywordDifficulty ?? "—"}
                        </td>
                        <td className="py-3 pr-4 font-mono text-sm tabular-nums">
                          {usd(d.cpcMicros)}
                        </td>
                        <td className="py-3 pr-4 font-mono text-sm tabular-nums">
                          {d.strongCompetitors ?? "—"}
                        </td>
                        <td className="py-3 pr-4 font-mono text-sm tabular-nums">
                          {pct(d.relativeChange ?? d.recentChange)}
                        </td>
                        <td className="py-3 pr-4 font-mono text-sm tabular-nums">
                          {count(d.variantCount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
