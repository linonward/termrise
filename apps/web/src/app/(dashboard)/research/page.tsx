import Link from "next/link";
import { getTranslations } from "next-intl/server";

import type { ResearchProjectDto } from "@repo/research/research-dto";
import { normalizeSeeds } from "@repo/research/research-rules";

import { LocalDateTime } from "@/components/local-date-time";
import { ProjectForm } from "@/features/research/project-form";
import { ResearchStatus } from "@/features/research/research-status";
import { apiGet } from "@/server/api/api";

export async function generateMetadata() {
  return { title: (await getTranslations("research"))("metaTitle") };
}

// Research projects (docs/product/ux.md#research). The (dashboard) layout checks the session.
export default async function ResearchPage({
  searchParams,
}: PageProps<"/research">) {
  const t = await getTranslations("research");
  // A radar item opens this page with ?name=&seed= to prefill a new project.
  const { name, seed } = await searchParams;
  const initial =
    typeof seed === "string" && seed
      ? {
          name: typeof name === "string" ? name : "",
          seeds: normalizeSeeds([seed]),
        }
      : undefined;
  const { items } = await apiGet<{ items: ResearchProjectDto[] }>(
    "/api/research/projects",
  );
  return (
    <main className="mx-auto w-full max-w-310 space-y-8 px-5 py-8 md:space-y-12 md:py-16">
      <header className="space-y-2">
        <h1 className="font-heading text-[28px] font-bold tracking-tight md:text-4xl">
          {t("title")}
        </h1>
        <p className="text-[15px] text-muted-foreground">{t("subtitle")}</p>
      </header>
      <div className="flex flex-col gap-8 md:flex-row md:items-start md:gap-12">
        <section
          aria-labelledby="projects-title"
          className="min-w-0 flex-1 space-y-4"
        >
          <h2
            id="projects-title"
            className="font-heading text-2xl font-semibold"
          >
            {t("projects")}
          </h2>
          {items.length === 0 ? (
            <div className="space-y-1 rounded-lg border border-border p-6">
              <p className="text-[15px] font-medium">{t("emptyTitle")}</p>
              <p className="text-[15px] text-muted-foreground">
                {t("emptyBody")}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[15px]">
                <thead>
                  <tr className="border-b border-border text-xs font-semibold tracking-[1px] text-muted-foreground uppercase">
                    {(["name", "seeds", "status", "created"] as const).map(
                      (key) => (
                        <th key={key} className="pr-4 pb-3 font-semibold">
                          {t(`column.${key}`)}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {items.map((project) => (
                    <tr
                      key={project.id}
                      data-testid="research-project-row"
                      className="border-b border-border"
                    >
                      <td className="py-4 pr-4 font-semibold">
                        <Link
                          href={`/research/${project.id}`}
                          className="hover:underline hover:underline-offset-4"
                        >
                          {project.name}
                        </Link>
                      </td>
                      <td className="py-4 pr-4 tabular-nums">
                        {project.seeds.length}
                      </td>
                      <td className="py-4 pr-4">
                        <ResearchStatus status={project.status} />
                      </td>
                      <td className="py-4 pr-4 whitespace-nowrap text-muted-foreground">
                        <LocalDateTime iso={project.createdAt} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <section
          aria-labelledby="new-project-title"
          className="space-y-5 md:w-100 md:rounded-lg md:border md:border-border md:p-6"
        >
          <h2
            id="new-project-title"
            className="font-heading text-xl font-semibold"
          >
            {t("newTitle")}
          </h2>
          <ProjectForm showMarket initial={initial} />
        </section>
      </div>
    </main>
  );
}
