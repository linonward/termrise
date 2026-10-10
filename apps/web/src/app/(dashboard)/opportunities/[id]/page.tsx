import { ArrowLeft, CircleAlert } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";

import type {
  KeywordDto,
  OpportunityDto,
  SerpDto,
  SourceSignalDto,
} from "@repo/research/research-dto";
import { WEIGHTS } from "@repo/research/scoring";

import { LocalDateTime } from "@/components/local-date-time";
import {
  NeedsReview,
  OpportunityStatus,
} from "@/features/opportunities/opportunity-badges";
import {
  FixtureNotice,
  KeywordTable,
  SerpList,
} from "@/features/research/research-results";
import { apiRequest } from "@/server/api/api";

type Detail = OpportunityDto & {
  keywords: KeywordDto[];
  serps: SerpDto[];
  signals: SourceSignalDto[];
};

async function loadOpportunity(id: string) {
  const response = await apiRequest(
    `/api/opportunities/${encodeURIComponent(id)}`,
  );
  if (response.status === 404) notFound();
  if (!response.ok)
    throw new Error(`API /api/opportunities failed: ${response.status}`);
  return (await response.json()) as Detail;
}

export async function generateMetadata({
  params,
}: PageProps<"/opportunities/[id]">) {
  return { title: (await loadOpportunity((await params).id)).cluster };
}

const dimensions = Object.keys(WEIGHTS) as (keyof typeof WEIGHTS)[];

// One opportunity: the score, how it was built, the AI analysis and the evidence
// (docs/product/ux.md#opportunities). AI never sets the score.
export default async function OpportunityPage({
  params,
}: PageProps<"/opportunities/[id]">) {
  const o = await loadOpportunity((await params).id);
  const t = await getTranslations("opportunities");
  const format = await getFormatter();
  const fixture =
    o.analystProvider === "fake" ||
    o.keywords.some((k) => k.provider === "fake");
  const list = (items: string[]) => (
    <ul className="list-disc space-y-1 pl-5">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
  return (
    <main className="mx-auto w-full max-w-310 space-y-8 px-5 py-8 md:space-y-10 md:py-16">
      <header className="space-y-4">
        <Link
          href="/opportunities"
          className="flex w-fit items-center gap-1 text-[15px] font-medium"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          {t("back")}
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-heading text-[28px] font-bold tracking-tight break-words md:text-4xl">
            {o.cluster}
          </h1>
          <OpportunityStatus status={o.status} />
          {o.needsReview && <NeedsReview />}
        </div>
        <p className="text-[15px] text-muted-foreground">
          <Link
            href={`/research/${o.projectId}`}
            className="font-medium underline underline-offset-4"
          >
            {o.projectName}
          </Link>{" "}
          · {t("evaluated")} <LocalDateTime iso={o.evaluatedAt} />
        </p>
      </header>
      {fixture && <FixtureNotice />}
      <div className="flex flex-col gap-8 md:flex-row md:items-start md:gap-12">
        <section
          aria-labelledby="score-title"
          className="min-w-0 flex-1 space-y-5 rounded-lg border border-border p-6"
        >
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="space-y-1">
              <h2
                id="score-title"
                className="text-xs font-semibold tracking-[1px] text-muted-foreground uppercase"
              >
                {t("score")}
              </h2>
              <p
                className="font-heading text-4xl font-bold tabular-nums"
                data-testid="opportunity-score"
              >
                {o.score}
                <span className="text-xl text-muted-foreground">/100</span>
              </p>
            </div>
            <div className="space-y-1 text-right">
              <p className="text-xs font-semibold tracking-[1px] text-muted-foreground uppercase">
                {t("confidence")}
              </p>
              <p className="font-heading text-2xl font-semibold tabular-nums">
                {o.confidence}%
              </p>
            </div>
          </div>
          <table className="w-full text-left text-[15px]">
            <thead>
              <tr className="border-b border-border text-xs font-semibold tracking-[1px] text-muted-foreground uppercase">
                <th className="pr-4 pb-3 font-semibold">
                  {t("column.dimension")}
                </th>
                <th className="pr-4 pb-3 text-right font-semibold">
                  {t("column.rating")}
                </th>
                <th className="pb-3 text-right font-semibold">
                  {t("column.weight")}
                </th>
              </tr>
            </thead>
            <tbody>
              {dimensions.map((key) => (
                <tr
                  key={key}
                  data-testid="dimension-row"
                  className="border-b border-border"
                >
                  <td className="py-3 pr-4">
                    <p className="font-medium">{t(`dimension.${key}`)}</p>
                    <p className="text-[13px] text-muted-foreground">
                      {t(`dimensionHint.${key}`)}
                    </p>
                  </td>
                  <td className="py-3 pr-4 text-right whitespace-nowrap tabular-nums">
                    {o.dimensions[key]}/5
                  </td>
                  <td className="py-3 text-right whitespace-nowrap text-muted-foreground tabular-nums">
                    {WEIGHTS[key]}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[13px] text-muted-foreground">
            {t("scoreNote", { version: o.scoringVersion })}
          </p>
        </section>
        <section
          aria-labelledby="analysis-title"
          className="space-y-4 rounded-lg bg-surface p-6 md:w-100"
        >
          <h2
            id="analysis-title"
            className="font-heading text-xl font-semibold"
          >
            {t("analysisTitle")}
          </h2>
          {o.analysis ? (
            <dl className="space-y-4 text-[15px]" data-testid="analysis">
              {(
                [
                  ["targetUser", o.analysis.targetUser],
                  ["job", o.analysis.job],
                  ["alternatives", list(o.analysis.alternatives)],
                  ["differentiation", o.analysis.differentiation],
                  ["pricing", o.analysis.pricing],
                  ["channels", list(o.analysis.channels)],
                  ["mvpScope", list(o.analysis.mvpScope)],
                  ["risks", list(o.analysis.risks)],
                ] as const
              ).map(([key, value]) => (
                <div key={key} className="space-y-1">
                  <dt className="text-xs font-semibold tracking-[1px] text-muted-foreground uppercase">
                    {t(`analysis.${key}`)}
                  </dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <div
              role="note"
              className="flex gap-3 rounded-md bg-warning-soft p-4"
              data-testid="analysis-error"
            >
              <CircleAlert
                aria-hidden="true"
                className="size-4.5 shrink-0 text-warning"
              />
              <p className="text-[13px]">
                {t(
                  `analysisError.${o.analysisError === "AI_INVALID_OUTPUT" ? "AI_INVALID_OUTPUT" : "AI_ERROR"}`,
                )}
              </p>
            </div>
          )}
          <p className="text-[13px] text-muted-foreground">
            {t("analysisNote")}
          </p>
        </section>
      </div>
      <section aria-labelledby="keywords-title" className="space-y-4">
        <h2 id="keywords-title" className="font-heading text-2xl font-semibold">
          {t("keywordsTitle")}{" "}
          <span className="text-muted-foreground tabular-nums">
            {o.keywords.length}
          </span>
        </h2>
        <KeywordTable items={o.keywords} />
      </section>
      {o.serps.length > 0 && (
        <section aria-labelledby="serp-title" className="space-y-4">
          <h2 id="serp-title" className="font-heading text-2xl font-semibold">
            {t("serpTitle")}
          </h2>
          <SerpList items={o.serps} />
        </section>
      )}
      <section aria-labelledby="signals-title" className="space-y-4">
        <h2 id="signals-title" className="font-heading text-2xl font-semibold">
          {t("signalsTitle")}{" "}
          <span className="text-muted-foreground tabular-nums">
            {o.signals.length}
          </span>
        </h2>
        {o.signals.length === 0 ? (
          <div className="rounded-lg border border-border p-6 text-[15px] text-muted-foreground">
            {t("signalsEmpty")}
          </div>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {o.signals.map((s) => (
              <li
                key={s.id}
                data-testid="evidence-signal"
                className="flex flex-wrap justify-between gap-2 px-6 py-3 text-[15px]"
              >
                <span className="font-medium">{s.term}</span>
                <span className="text-muted-foreground tabular-nums">
                  {s.source ?? t("sourceCsv")}
                  {s.observedAt &&
                    ` · ${format.dateTime(new Date(s.observedAt), { dateStyle: "medium", timeZone: "UTC" })}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
