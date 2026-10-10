import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { MAX_COMPARED } from "@repo/research/opportunity-rules";
import type { OpportunityDto } from "@repo/research/research-dto";
import { Button } from "@repo/ui/components/button";

import { StarButton } from "@/components/favorites/star-button";
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
  const params = await searchParams;
  const projectId =
    typeof params.project === "string" ? params.project : undefined;
  const starred = params.starred === "1";
  const t = await getTranslations("opportunities");
  const query = new URLSearchParams({
    ...(projectId ? { projectId } : {}),
    ...(starred ? { starred: "1" } : {}),
  });
  const { items } = await apiGet<{ items: OpportunityDto[] }>(
    `/api/opportunities${query.size > 0 ? `?${query}` : ""}`,
  );
  // The same filters with the star filter switched.
  const toggled = new URLSearchParams({
    ...(projectId ? { project: projectId } : {}),
    ...(starred ? {} : { starred: "1" }),
  });
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
      <Link
        href={`/opportunities${toggled.size > 0 ? `?${toggled}` : ""}`}
        aria-pressed={starred}
        className="block w-fit text-[15px] font-semibold underline underline-offset-4"
      >
        {starred ? t("showAllStars") : t("starredOnly")}
      </Link>
      {items.some((o) => o.analystProvider === "fake") && <FixtureNotice />}
      {items.length === 0 && starred ? (
        <div className="rounded-lg border border-border p-6">
          <p className="text-[15px] text-muted-foreground">
            {t("starredEmpty")}
          </p>
        </div>
      ) : items.length === 0 ? (
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
        <form action="/opportunities/compare" className="space-y-4">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[15px]">
              <thead>
                <tr className="border-b border-border text-xs font-semibold tracking-[1px] text-muted-foreground uppercase">
                  <th className="pr-4 pb-3">
                    <span className="sr-only">{t("column.select")}</span>
                  </th>
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
                      <input
                        type="checkbox"
                        name="id"
                        value={o.id}
                        aria-label={t("selectOne", { name: o.cluster })}
                        className="size-4 accent-brand"
                      />
                    </td>
                    <td className="py-4 pr-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <StarButton
                          path={`/api/opportunities/${o.id}/star`}
                          starred={o.starred}
                          name={o.cluster}
                        />
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
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" variant="outline" className="h-10 px-4">
              {t("compare")}
            </Button>
            <p className="text-[13px] text-muted-foreground">
              {t("compareHint", { max: MAX_COMPARED })}
            </p>
          </div>
        </form>
      )}
    </main>
  );
}
