import { ArrowLeft, CircleAlert } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";

import type { ExecutionProjectDto } from "@repo/execution/execution-dto";
import type {
  DecisionDto,
  ExperimentDto,
  KeywordDto,
  OpportunityDto,
  SerpDto,
  SourceSignalDto,
} from "@repo/research/research-dto";
import { WEIGHTS } from "@repo/research/scoring";

import { StarButton } from "@/components/favorites/star-button";
import { LocalDateTime } from "@/components/local-date-time";
import { BriefPanel } from "@/features/opportunities/brief-panel";
import { DecisionForm } from "@/features/opportunities/decision-form";
import { ExperimentForm } from "@/features/opportunities/experiment-form";
import { ExperimentProgress } from "@/features/opportunities/experiment-progress";
import {
  NeedsReview,
  OpportunityStatus,
} from "@/features/opportunities/opportunity-badges";
import { StartProduct } from "@/features/products/product-forms";
import {
  FixtureNotice,
  KeywordTable,
  SerpList,
} from "@/features/research/research-results";
import { apiGet, apiRequest } from "@/server/api/api";

type Detail = OpportunityDto & {
  keywords: KeywordDto[];
  serps: SerpDto[];
  signals: SourceSignalDto[];
  decisions: DecisionDto[];
  experiments: ExperimentDto[];
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

async function loadBrief(id: string) {
  const response = await apiRequest(
    `/api/opportunities/${encodeURIComponent(id)}/brief.md`,
  );
  if (response.status === 404) notFound();
  if (!response.ok)
    throw new Error(`API /api/opportunities brief failed: ${response.status}`);
  const fileName =
    /filename="([^"]+)"/.exec(
      response.headers.get("Content-Disposition") ?? "",
    )?.[1] ?? "brief.md";
  return { markdown: await response.text(), fileName };
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
  const { id } = await params;
  const [o, brief] = await Promise.all([loadOpportunity(id), loadBrief(id)]);
  const tp = await getTranslations("products");
  const [product] =
    o.status === "go"
      ? (
          await apiGet<{ items: ExecutionProjectDto[] }>(
            `/api/execution/projects?opportunityId=${o.id}`,
          )
        ).items
      : [];
  const t = await getTranslations("opportunities");
  const td = await getTranslations("decisions");
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
          <StarButton
            path={`/api/opportunities/${o.id}/star`}
            starred={o.starred}
            name={o.cluster}
          />
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
                  `analysisError.${o.analysisError === "AI_INVALID_OUTPUT" || o.analysisError === "BUDGET_EXHAUSTED" ? o.analysisError : "AI_ERROR"}`,
                )}
              </p>
            </div>
          )}
          <p className="text-[13px] text-muted-foreground">
            {t("analysisNote")}
            {o.analystModel &&
              ` ${t("analysisModel", { model: o.analystModel })}`}
          </p>
        </section>
      </div>
      <div className="flex flex-col gap-8 md:flex-row md:items-start md:gap-12">
        <section
          aria-labelledby="experiments-title"
          className="min-w-0 flex-1 space-y-4"
        >
          <div className="space-y-2">
            <h2
              id="experiments-title"
              className="font-heading text-2xl font-semibold"
            >
              {td("experimentsTitle")}{" "}
              <span className="text-muted-foreground tabular-nums">
                {o.experiments.length}
              </span>
            </h2>
            <p className="text-[15px] text-muted-foreground">
              {td("experimentsBody")}
            </p>
          </div>
          {o.experiments.length === 0 ? (
            <div className="rounded-lg border border-border p-6 text-[15px] text-muted-foreground">
              {td("experimentsEmpty")}
            </div>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {o.experiments.map((e) => (
                <li
                  key={e.id}
                  data-testid="experiment"
                  className="space-y-3 px-6 py-5"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{td(`kind.${e.kind}`)}</p>
                    <span
                      data-testid="experiment-status"
                      className="inline-flex h-6 items-center rounded-full bg-surface-strong px-2 text-xs font-semibold tracking-[1px] text-muted-foreground uppercase"
                    >
                      {td(`experimentStatus.${e.status}`)}
                    </span>
                  </div>
                  <p className="text-[15px]">{e.hypothesis}</p>
                  <dl className="grid gap-x-6 gap-y-2 text-[13px] md:grid-cols-2">
                    {(
                      [
                        ["channel", e.channel],
                        ["metric", e.metric],
                        ["successThreshold", e.successThreshold],
                        ["stopCondition", e.stopCondition],
                        [
                          "budgetUsd",
                          format.number(e.budgetUsd, {
                            style: "currency",
                            currency: "USD",
                          }),
                        ],
                        ["durationDays", td("days", { count: e.durationDays })],
                      ] as const
                    ).map(([key, value]) => (
                      <div key={key}>
                        <dt className="text-muted-foreground">
                          {td(`field.${key}`)}
                        </dt>
                        <dd className="font-medium">{value}</dd>
                      </div>
                    ))}
                  </dl>
                  {e.resultNote && (
                    <p className="text-[15px]">
                      <span className="text-muted-foreground">
                        {td("resultNote")}:
                      </span>{" "}
                      {e.resultNote}
                    </p>
                  )}
                  {e.nextStatuses.length > 0 && (
                    <ExperimentProgress opportunityId={o.id} experiment={e} />
                  )}
                </li>
              ))}
            </ul>
          )}
          <details className="rounded-lg border border-border">
            <summary className="cursor-pointer px-6 py-4 text-[15px] font-semibold">
              {td("newExperiment")}
            </summary>
            <div className="border-t border-border p-6">
              <ExperimentForm opportunityId={o.id} />
            </div>
          </details>
        </section>
        <section
          aria-labelledby="decision-title"
          className="space-y-5 rounded-lg border border-border p-6 md:w-100"
        >
          <div className="space-y-2">
            <h2
              id="decision-title"
              className="font-heading text-xl font-semibold"
            >
              {td("title")}
            </h2>
            <p className="text-[15px] text-muted-foreground">{td("body")}</p>
          </div>
          {o.status === "go" && (
            <div className="space-y-3 rounded-md bg-success-soft p-4">
              <p className="text-[15px]">{tp("startBody")}</p>
              {product ? (
                <Link
                  href={`/projects/${product.id}`}
                  className="inline-flex text-[15px] font-semibold underline underline-offset-4"
                >
                  {tp("open")}
                </Link>
              ) : (
                <StartProduct opportunityId={o.id} />
              )}
            </div>
          )}
          <DecisionForm opportunityId={o.id} nextDecisions={o.nextDecisions} />
          {o.decisions.length > 0 && (
            <div className="space-y-3 border-t border-border pt-5">
              <h3 className="text-xs font-semibold tracking-[1px] text-muted-foreground uppercase">
                {td("history")}
              </h3>
              <ol className="space-y-4">
                {o.decisions.map((d) => (
                  <li
                    key={d.id}
                    data-testid="decision"
                    className="space-y-1 text-[15px]"
                  >
                    <p className="font-semibold">
                      {td(`decided.${d.decision}`)}
                    </p>
                    <p>{d.reason}</p>
                    <p className="text-[13px] text-muted-foreground">
                      {d.deciderName} · <LocalDateTime iso={d.createdAt} /> ·{" "}
                      {td("evidenceVersion", {
                        version: d.scoringVersion,
                        score: d.score,
                      })}
                    </p>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </section>
      </div>
      <section aria-labelledby="brief-title" className="space-y-4">
        <div className="space-y-2">
          <h2 id="brief-title" className="font-heading text-2xl font-semibold">
            {td("briefTitle")}
          </h2>
          <p className="text-[15px] text-muted-foreground">{td("briefBody")}</p>
        </div>
        <BriefPanel markdown={brief.markdown} fileName={brief.fileName} />
      </section>
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
