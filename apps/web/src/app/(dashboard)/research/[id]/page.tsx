import { ArrowLeft, ArrowRight } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";

import type {
  KeywordDto,
  ResearchProjectDto,
  ResearchRunDto,
  SerpDto,
  SourceSignalDto,
} from "@repo/research/research-dto";

import { LocalDateTime } from "@/components/local-date-time";
import { DeleteProject } from "@/features/research/delete-project";
import { ImportCsv } from "@/features/research/import-csv";
import { ProjectForm } from "@/features/research/project-form";
import {
  FixtureNotice,
  KeywordTable,
  LastRun,
  SerpList,
} from "@/features/research/research-results";
import { ResearchStatus } from "@/features/research/research-status";
import { RunResearch } from "@/features/research/run-research";
import { apiGet, apiRequest } from "@/server/api/api";

async function loadProject(id: string) {
  const response = await apiRequest(
    `/api/research/projects/${encodeURIComponent(id)}`,
  );
  if (response.status === 404) notFound();
  if (!response.ok)
    throw new Error(`API /api/research/projects failed: ${response.status}`);
  return (await response.json()) as ResearchProjectDto;
}

export async function generateMetadata({
  params,
}: PageProps<"/research/[id]">) {
  return { title: (await loadProject((await params).id)).name };
}

// One research project; a draft can be edited and deleted (docs/product/ux.md#research).
export default async function ResearchProjectPage({
  params,
}: PageProps<"/research/[id]">) {
  const project = await loadProject((await params).id);
  const base = `/api/research/projects/${project.id}`;
  const [
    { items: signals },
    { items: runs },
    { items: keywords },
    { items: serps },
  ] = await Promise.all([
    apiGet<{ items: SourceSignalDto[] }>(`${base}/signals`),
    apiGet<{ items: ResearchRunDto[] }>(`${base}/runs`),
    apiGet<{ items: KeywordDto[] }>(`${base}/keywords`),
    apiGet<{ items: SerpDto[] }>(`${base}/serps`),
  ]);
  const lastRun = runs[0];
  const canRun = project.status === "draft" || project.status === "failed";
  const fixture =
    keywords.some((k) => k.provider === "fake") ||
    serps.some((s) => s.provider === "fake");
  const t = await getTranslations("research");
  const format = await getFormatter();
  const usd = (value: number) =>
    format.number(value, { style: "currency", currency: "USD" });
  const draft = project.status === "draft";
  return (
    <main className="mx-auto w-full max-w-310 space-y-8 px-5 py-8 md:space-y-10 md:py-16">
      <header className="space-y-4">
        <Link
          href="/research"
          className="flex w-fit items-center gap-1 text-[15px] font-medium"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          {t("back")}
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-heading text-[28px] font-bold tracking-tight break-words md:text-4xl">
            {project.name}
          </h1>
          <ResearchStatus status={project.status} />
        </div>
        <p className="text-[15px] text-muted-foreground">
          {t("marketValue")} · {t("created")}{" "}
          <LocalDateTime iso={project.createdAt} />
        </p>
      </header>
      <div className="flex flex-col gap-8 md:flex-row md:items-start md:gap-12">
        <section
          aria-labelledby="edit-title"
          className="min-w-0 flex-1 space-y-5 rounded-lg border border-border p-6"
        >
          <div className="space-y-2">
            <h2 id="edit-title" className="font-heading text-xl font-semibold">
              {t("editTitle")}
            </h2>
            <p className="text-[15px] text-muted-foreground">
              {draft ? t("editNote") : t("lockedNote")}
            </p>
          </div>
          {/* An import that adds signals can add seeds behind this uncontrolled form:
              remount it then. A save keeps it, so its "saved" message stays. */}
          <ProjectForm key={signals.length} project={project} />
        </section>
        <div className="space-y-6 md:w-90">
          {canRun && (
            <RunResearch
              projectId={project.id}
              retry={project.status === "failed"}
            />
          )}
          {lastRun && <LastRun run={lastRun} />}
          {(lastRun?.status === "completed" ||
            lastRun?.status === "partial") && (
            <Link
              href={`/opportunities?project=${project.id}`}
              className="flex w-fit items-center gap-1 text-[15px] font-semibold underline underline-offset-4"
            >
              {t("viewOpportunities")}
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          )}
          <dl className="space-y-4 rounded-lg bg-surface p-6">
            {(
              [
                ["summarySeeds", String(project.seeds.length)],
                ["summaryDataBudget", usd(project.dataBudgetUsd)],
                ["summaryAiBudget", usd(project.aiBudgetUsd)],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="space-y-1">
                <dt className="text-xs font-semibold tracking-[1px] text-muted-foreground uppercase">
                  {t(label)}
                </dt>
                <dd className="font-heading text-2xl font-semibold tabular-nums">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
          {draft && <DeleteProject projectId={project.id} />}
        </div>
      </div>
      <div className="flex flex-col gap-8 md:flex-row md:items-start md:gap-12">
        <section
          aria-labelledby="signals-title"
          className="min-w-0 flex-1 space-y-4"
        >
          <h2
            id="signals-title"
            className="font-heading text-2xl font-semibold"
          >
            {t("signalsTitle")}{" "}
            <span className="text-muted-foreground tabular-nums">
              {signals.length}
            </span>
          </h2>
          {signals.length === 0 ? (
            <div className="rounded-lg border border-border p-6 text-[15px] text-muted-foreground">
              {t("signalsEmpty")}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[15px]">
                <thead>
                  <tr className="border-b border-border text-xs font-semibold tracking-[1px] text-muted-foreground uppercase">
                    {(["term", "source", "observed", "link"] as const).map(
                      (key) => (
                        <th key={key} className="pr-4 pb-3 font-semibold">
                          {t(`signalColumn.${key}`)}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {signals.map((signal) => (
                    <tr
                      key={signal.id}
                      data-testid="signal-row"
                      className="border-b border-border"
                    >
                      <td className="py-3.5 pr-4 font-medium">{signal.term}</td>
                      <td className="py-3.5 pr-4 text-muted-foreground">
                        {signal.source ?? t("sourceCsv")}
                      </td>
                      <td className="py-3.5 pr-4 whitespace-nowrap text-muted-foreground tabular-nums">
                        {signal.observedAt
                          ? format.dateTime(new Date(signal.observedAt), {
                              dateStyle: "medium",
                              timeZone: "UTC",
                            })
                          : t("noDate")}
                      </td>
                      <td className="py-3.5 pr-4">
                        {signal.url && (
                          <a
                            href={signal.url}
                            target="_blank"
                            rel="noreferrer nofollow"
                            className="font-medium underline underline-offset-4"
                          >
                            {t("open")}
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        {draft && (
          <div className="md:w-90">
            <ImportCsv projectId={project.id} />
          </div>
        )}
      </div>
      <section aria-labelledby="keywords-title" className="space-y-4">
        <h2 id="keywords-title" className="font-heading text-2xl font-semibold">
          {t("keywordsTitle")}{" "}
          <span className="text-muted-foreground tabular-nums">
            {keywords.length}
          </span>
        </h2>
        {fixture && <FixtureNotice />}
        {keywords.length === 0 ? (
          <div className="rounded-lg border border-border p-6 text-[15px] text-muted-foreground">
            {t("keywordsEmpty")}
          </div>
        ) : (
          <KeywordTable items={keywords} />
        )}
      </section>
      {serps.length > 0 && (
        <section aria-labelledby="serp-title" className="space-y-4">
          <div className="space-y-2">
            <h2 id="serp-title" className="font-heading text-2xl font-semibold">
              {t("serpTitle")}
            </h2>
            <p className="text-[15px] text-muted-foreground">{t("serpBody")}</p>
          </div>
          <SerpList items={serps} />
        </section>
      )}
    </main>
  );
}
