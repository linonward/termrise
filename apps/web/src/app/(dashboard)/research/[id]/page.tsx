import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";

import type { ResearchProjectDto } from "@repo/research/research-dto";

import { LocalDateTime } from "@/components/local-date-time";
import { DeleteProject } from "@/features/research/delete-project";
import { ProjectForm } from "@/features/research/project-form";
import { ResearchStatus } from "@/features/research/research-status";
import { apiRequest } from "@/server/api/api";

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
          <ProjectForm project={project} />
        </section>
        <div className="space-y-6 md:w-90">
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
    </main>
  );
}
