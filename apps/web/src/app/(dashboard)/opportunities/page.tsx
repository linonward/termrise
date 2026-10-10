import Link from "next/link";
import { getTranslations } from "next-intl/server";

import type { OpportunityDto } from "@repo/research/research-dto";

import {
  NeedsReview,
  OpportunityStatus,
} from "@/features/opportunities/opportunity-badges";
import { FixtureNotice } from "@/features/research/research-results";
import { apiGet } from "@/server/api/api";

export async function generateMetadata() {
  return { title: (await getTranslations("opportunities"))("metaTitle") };
}

// Ranked opportunities of all projects, or of one with ?project= (docs/product/ux.md#opportunities).
export default async function OpportunitiesPage({
  searchParams,
}: PageProps<"/opportunities">) {
  const { project } = await searchParams;
  const projectId = typeof project === "string" ? project : undefined;
  const t = await getTranslations("opportunities");
  const { items } = await apiGet<{ items: OpportunityDto[] }>(
    projectId
      ? `/api/opportunities?projectId=${encodeURIComponent(projectId)}`
      : "/api/opportunities",
  );
  return (
    <main className="mx-auto w-full max-w-310 space-y-8 px-5 py-8 md:space-y-12 md:py-16">
      <header className="space-y-2">
        <h1 className="font-heading text-[28px] font-bold tracking-tight md:text-4xl">
          {t("title")}
        </h1>
        <p className="text-[15px] text-muted-foreground">{t("subtitle")}</p>
      </header>
      {projectId && (
        <p className="text-[15px] text-muted-foreground">
          {t("projectFilter", { name: items[0]?.projectName ?? "—" })}{" "}
          <Link
            href="/opportunities"
            className="font-semibold text-foreground underline underline-offset-4"
          >
            {t("showAll")}
          </Link>
        </p>
      )}
      {items.some((o) => o.analystProvider === "fake") && <FixtureNotice />}
      {items.length === 0 ? (
        <div className="space-y-1 rounded-lg border border-border p-6">
          <p className="text-[15px] font-medium">{t("emptyTitle")}</p>
          <p className="text-[15px] text-muted-foreground">
            {t("emptyBody")}{" "}
            <Link
              href="/research"
              className="font-semibold underline underline-offset-4"
            >
              {t("emptyLink")}
            </Link>
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[15px]">
            <thead>
              <tr className="border-b border-border text-xs font-semibold tracking-[1px] text-muted-foreground uppercase">
                {(
                  [
                    "opportunity",
                    "project",
                    "score",
                    "confidence",
                    "status",
                  ] as const
                ).map((key) => (
                  <th
                    key={key}
                    className={
                      key === "score" || key === "confidence"
                        ? "pr-4 pb-3 text-right font-semibold"
                        : "pr-4 pb-3 font-semibold"
                    }
                  >
                    {t(`column.${key}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((o) => (
                <tr
                  key={o.id}
                  data-testid="opportunity-row"
                  className="border-b border-border"
                >
                  <td className="py-4 pr-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/opportunities/${o.id}`}
                        className="font-semibold hover:underline hover:underline-offset-4"
                      >
                        {o.cluster}
                      </Link>
                      {o.needsReview && <NeedsReview />}
                    </div>
                  </td>
                  <td className="py-4 pr-4 text-muted-foreground">
                    <Link
                      href={`/research/${o.projectId}`}
                      className="hover:underline hover:underline-offset-4"
                    >
                      {o.projectName}
                    </Link>
                  </td>
                  <td className="py-4 pr-4 text-right font-heading text-xl font-semibold tabular-nums">
                    {o.score}
                  </td>
                  <td className="py-4 pr-4 text-right tabular-nums">
                    {o.confidence}%
                  </td>
                  <td className="py-4 pr-4">
                    <OpportunityStatus status={o.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
