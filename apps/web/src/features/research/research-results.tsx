import { ChevronDown, Info } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";

import type {
  KeywordDto,
  ResearchRunDto,
  SerpDto,
} from "@repo/research/research-dto";

import { LocalDateTime } from "@/components/local-date-time";

// What the research runs stored (docs/product/ux.md#research). Server components.

/** The newest run: status, time and why it failed. */
export async function LastRun({ run }: { run: ResearchRunDto }) {
  const t = await getTranslations("research");
  return (
    <div className="space-y-1 text-[15px]">
      <p className="text-xs font-semibold tracking-[1px] text-muted-foreground uppercase">
        {t("lastRun")}
      </p>
      <p className="font-medium" data-testid="last-run">
        {t(`runStatus.${run.status}`)} ·{" "}
        <LocalDateTime iso={run.finishedAt ?? run.startedAt} />
      </p>
      {run.status === "failed" && run.errorCode && (
        <p className="text-muted-foreground">
          {t(
            `runError.${run.errorCode === "PROVIDER_ERROR" || run.errorCode === "BUDGET_EXHAUSTED" ? run.errorCode : "INTERNAL_ERROR"}`,
          )}
        </p>
      )}
      {run.status === "pending" && (
        <p className="text-muted-foreground">{t("runQueuedNote")}</p>
      )}
      {run.status === "partial" && (
        <p className="text-muted-foreground">
          {run.errorCode === "BUDGET_EXHAUSTED"
            ? t("runPartialBudget")
            : t("runPartialNote")}
        </p>
      )}
    </div>
  );
}

/** Shown whenever any shown number comes from the fake provider. */
export async function FixtureNotice() {
  const t = await getTranslations("research");
  return (
    <div
      role="note"
      className="flex gap-3 rounded-md bg-info-soft p-4"
      data-testid="fixture-notice"
    >
      <Info aria-hidden="true" className="size-4.5 shrink-0 text-info" />
      <div className="space-y-0.5">
        <p className="text-sm font-semibold">{t("fixtureTitle")}</p>
        <p className="text-[13px] text-muted-foreground">{t("fixtureBody")}</p>
      </div>
    </div>
  );
}

export async function KeywordTable({ items }: { items: KeywordDto[] }) {
  const t = await getTranslations("research");
  const format = await getFormatter();
  const noData = <span className="text-subtle-foreground">{t("noData")}</span>;
  const number = (value: number | null) =>
    value === null ? noData : format.number(value);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-[15px]">
        <thead>
          <tr className="border-b border-border text-xs font-semibold tracking-[1px] text-muted-foreground uppercase">
            {(["keyword", "volume", "cpc", "ads", "kd"] as const).map((key) => (
              <th
                key={key}
                className={
                  key === "keyword"
                    ? "pr-4 pb-3 font-semibold"
                    : "pr-4 pb-3 text-right font-semibold"
                }
              >
                {t(`keywordColumn.${key}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((keyword) => (
            <tr
              key={keyword.id}
              data-testid="keyword-row"
              className="border-b border-border"
            >
              <td className="py-3.5 pr-4">
                <span className="font-medium">{keyword.phrase}</span>
                {keyword.source === "seed" && (
                  <span className="ml-2 inline-flex h-5 items-center rounded-full bg-brand-soft px-2 text-xs font-semibold text-brand-text">
                    {t("seedBadge")}
                  </span>
                )}
              </td>
              <td className="py-3.5 pr-4 text-right whitespace-nowrap tabular-nums">
                {number(keyword.searchVolume)}
              </td>
              <td className="py-3.5 pr-4 text-right whitespace-nowrap tabular-nums">
                {keyword.cpcUsd === null
                  ? noData
                  : format.number(keyword.cpcUsd, {
                      style: "currency",
                      currency: "USD",
                    })}
              </td>
              <td className="py-3.5 pr-4 text-right whitespace-nowrap tabular-nums">
                {number(keyword.adsCompetition)}
              </td>
              <td className="py-3.5 pr-4 text-right whitespace-nowrap tabular-nums">
                {number(keyword.keywordDifficulty)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SerpList({ items }: { items: SerpDto[] }) {
  // Collapsed per keyword: five lists of ten would push everything else away.
  return (
    <div className="divide-y divide-border rounded-lg border border-border">
      {items.map((serp, index) => (
        <details
          key={serp.phrase}
          open={index === 0}
          className="group"
          data-testid="serp"
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-4 text-[15px] font-semibold">
            {serp.phrase}
            <ChevronDown
              aria-hidden="true"
              className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
            />
          </summary>
          <ol className="divide-y divide-border border-t border-border">
            {serp.results.map((result) => (
              <li key={result.rank} className="flex gap-4 px-6 py-3">
                <span className="w-6 shrink-0 text-[13px] font-semibold text-muted-foreground tabular-nums">
                  {result.rank}
                </span>
                <span className="min-w-0 space-y-0.5">
                  <a
                    href={result.url}
                    target="_blank"
                    rel="noreferrer nofollow"
                    className="block truncate text-[15px] font-medium hover:underline hover:underline-offset-4"
                  >
                    {result.title}
                  </a>
                  <span className="block truncate text-[13px] text-muted-foreground">
                    {new URL(result.url).hostname}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </details>
      ))}
    </div>
  );
}
