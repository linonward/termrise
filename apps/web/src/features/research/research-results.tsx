import { ChevronDown, Info } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";

import type {
  KeywordDto,
  ResearchRunDto,
  SerpDto,
} from "@repo/research/research-dto";
import { Tag } from "@repo/ui/components/badge";

import { LocalDateTime } from "@/components/local-date-time";
import { StatusBadge } from "@/components/status-badge";
import { OffTopicToggle } from "@/features/opportunities/off-topic-toggle";
import { runBadge } from "@/lib/status-badges";

// What the research runs stored (docs/product/ux.md#research). Server components.

/** The newest run: status, time and why it failed. */
export async function LastRun({ run }: { run: ResearchRunDto }) {
  const t = await getTranslations("research");
  return (
    <div className="space-y-1 text-[15px]">
      <p className="text-xs font-semibold tracking-[1px] text-muted-foreground uppercase">
        {t("lastRun")}
      </p>
      <p
        className="flex flex-wrap items-center gap-2 font-medium"
        data-testid="last-run"
      >
        <StatusBadge badge={runBadge(run.status)}>
          {t(`runStatus.${run.status}`)}
        </StatusBadge>
        <span className="text-muted-foreground">
          <LocalDateTime iso={run.finishedAt ?? run.startedAt} />
        </span>
      </p>
      {run.status === "failed" && run.errorCode && (
        <p className="text-muted-foreground">
          {t(
            `runError.${run.errorCode === "PROVIDER_ERROR" || run.errorCode === "PROVIDER_AUTH_FAILED" || run.errorCode === "BUDGET_EXHAUSTED" || run.errorCode === "MONTHLY_BUDGET_EXHAUSTED" || run.errorCode === "RUN_TIMED_OUT" ? run.errorCode : "INTERNAL_ERROR"}`,
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
            : run.errorCode === "MONTHLY_BUDGET_EXHAUSTED"
              ? t("runPartialMonthly")
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

export async function KeywordTable({
  items,
  opportunityId,
}: {
  items: (KeywordDto & {
    offTopic?: boolean;
    offTopicBy?: "ai" | "user" | null;
  })[];
  /** On an opportunity: each keyword can be marked off topic or on topic. */
  opportunityId?: string;
}) {
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
            {opportunityId && (
              <th className="pb-3 text-right font-semibold">
                {t("keywordColumn.topic")}
              </th>
            )}
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
                  <Tag tone="brand" className="ml-2">
                    {t("seedBadge")}
                  </Tag>
                )}
              </td>
              <td className="py-3.5 pr-4 text-right font-mono text-sm font-medium whitespace-nowrap tabular-nums">
                {number(keyword.searchVolume)}
              </td>
              <td className="py-3.5 pr-4 text-right font-mono text-sm font-medium whitespace-nowrap tabular-nums">
                {keyword.cpcUsd === null
                  ? noData
                  : format.number(keyword.cpcUsd, {
                      style: "currency",
                      currency: "USD",
                    })}
              </td>
              <td className="py-3.5 pr-4 text-right font-mono text-sm font-medium whitespace-nowrap tabular-nums">
                {number(keyword.adsCompetition)}
              </td>
              <td className="py-3.5 pr-4 text-right font-mono text-sm font-medium whitespace-nowrap tabular-nums">
                {number(keyword.keywordDifficulty)}
              </td>
              {opportunityId && (
                <td className="py-2.5 text-right">
                  <OffTopicToggle
                    opportunityId={opportunityId}
                    keywordId={keyword.id}
                    phrase={keyword.phrase}
                    offTopic={keyword.offTopic ?? false}
                    by={keyword.offTopicBy ?? null}
                  />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export async function SerpList({ items }: { items: SerpDto[] }) {
  const t = await getTranslations("research");
  // Collapsed per keyword: five lists of ten would push everything else away.
  return (
    <div className="divide-y divide-border border-y border-border">
      {items.map((serp, index) => (
        <details
          key={serp.phrase}
          open={index === 0}
          className="group"
          data-testid="serp"
        >
          <summary className="flex cursor-pointer list-none items-center gap-2 py-4 text-[15px] font-semibold">
            <ChevronDown
              aria-hidden="true"
              className="size-4 shrink-0 -rotate-90 text-muted-foreground transition-transform group-open:rotate-0"
            />
            <span className="min-w-0 flex-1 truncate">{serp.phrase}</span>
            <span className="shrink-0 text-[13px] font-medium text-muted-foreground">
              {t("serpResults", { count: serp.results.length })}
            </span>
          </summary>
          <ol className="divide-y divide-border pb-2 pl-6">
            {serp.results.map((result) => (
              <li key={result.rank} className="flex gap-4 py-3">
                <span className="w-6 shrink-0 text-right font-mono text-[13px] font-medium text-muted-foreground tabular-nums">
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
                    {result.site ?? new URL(result.url).hostname}
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
