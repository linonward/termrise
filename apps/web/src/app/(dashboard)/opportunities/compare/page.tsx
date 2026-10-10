import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { MAX_COMPARED } from "@repo/research/opportunity-rules";
import type { OpportunityDetailDto } from "@repo/research/research-dto";

import {
  NeedsReview,
  OpportunityStatus,
} from "@/features/opportunities/opportunity-badges";
import { FixtureNotice } from "@/features/research/research-results";
import { apiRequest } from "@/server/api/api";

export async function generateMetadata() {
  return { title: (await getTranslations("compare"))("metaTitle") };
}

const DIMENSIONS = [
  "trend",
  "demand",
  "competition",
  "commercial",
  "mvp",
  "distribution",
] as const;

// An opportunity the user may not see, or that no longer exists, is left out.
async function load(id: string) {
  const response = await apiRequest(
    `/api/opportunities/${encodeURIComponent(id)}`,
  );
  if (response.status === 404) return null;
  if (!response.ok)
    throw new Error(`API /api/opportunities failed: ${response.status}`);
  return (await response.json()) as OpportunityDetailDto;
}

// Opportunities side by side (docs/product/ux.md#compare): the same stored numbers and
// hypotheses as their detail pages, one column each.
export default async function ComparePage({
  searchParams,
}: PageProps<"/opportunities/compare">) {
  const { id } = await searchParams;
  const ids = [...new Set(typeof id === "string" ? [id] : (id ?? []))].slice(
    0,
    MAX_COMPARED,
  );
  const items = (await Promise.all(ids.map(load))).filter(
    (o): o is OpportunityDetailDto => o !== null,
  );
  const t = await getTranslations("compare");
  const to = await getTranslations("opportunities");
  const format = await getFormatter();
  const noData = <span className="text-subtle-foreground">{t("noData")}</span>;
  const num = (value: number | null) =>
    value === null ? noData : format.number(value);
  const list = (values: string[] | undefined) =>
    values?.length ? (
      <ul className="list-disc space-y-1 pl-5">
        {values.map((v) => (
          <li key={v}>{v}</li>
        ))}
      </ul>
    ) : (
      noData
    );
  // The keyword with the most searches stands for the opportunity's demand.
  const top = (o: OpportunityDetailDto) =>
    [...o.keywords].sort(
      (a, b) => (b.searchVolume ?? -1) - (a.searchVolume ?? -1),
    )[0];
  const rows: [string, (o: OpportunityDetailDto) => ReactNode][] = [
    ["project", (o) => o.projectName],
    ["status", (o) => <OpportunityStatus status={o.status} />],
    [
      "score",
      (o) => (
        <span className="font-heading text-xl font-semibold tabular-nums">
          {o.score}
        </span>
      ),
    ],
    [
      "confidence",
      (o) => (
        <span className="flex flex-wrap items-center gap-2">
          <span className="tabular-nums">{o.confidence}%</span>
          {o.needsReview && <NeedsReview />}
        </span>
      ),
    ],
    ...DIMENSIONS.map(
      (key) =>
        [
          `dimension.${key}`,
          (o: OpportunityDetailDto) => (
            <span className="tabular-nums">{o.dimensions[key]} / 5</span>
          ),
        ] as [string, (o: OpportunityDetailDto) => ReactNode],
    ),
    ["topKeyword", (o) => top(o)?.phrase ?? noData],
    ["searchVolume", (o) => num(top(o)?.searchVolume ?? null)],
    ["keywordDifficulty", (o) => num(top(o)?.keywordDifficulty ?? null)],
    [
      "cpc",
      (o) => {
        const cpc = top(o)?.cpcUsd ?? null;
        return cpc === null
          ? noData
          : format.number(cpc, { style: "currency", currency: "USD" });
      },
    ],
    ["keywords", (o) => num(o.keywords.length)],
    ["serps", (o) => num(o.serps.length)],
    ["targetUser", (o) => o.analysis?.targetUser ?? noData],
    ["pricing", (o) => o.analysis?.pricing ?? noData],
    ["mvpScope", (o) => list(o.analysis?.mvpScope)],
    ["risks", (o) => list(o.analysis?.risks)],
  ];
  const label = (key: string) =>
    key.startsWith("dimension.")
      ? to(key as `dimension.${(typeof DIMENSIONS)[number]}`)
      : t(`row.${key as "project"}`);

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
        <h1 className="font-heading text-[28px] font-bold tracking-tight md:text-4xl">
          {t("title")}
        </h1>
        <p className="text-[15px] text-muted-foreground">{t("subtitle")}</p>
      </header>
      {items.length < 2 ? (
        <div className="rounded-lg border border-border p-6">
          <p className="text-[15px] text-muted-foreground">
            {t("tooFew", { max: MAX_COMPARED })}
          </p>
        </div>
      ) : (
        <>
          {items.some(
            (o) =>
              o.analystProvider === "fake" ||
              o.keywords.some((k) => k.provider === "fake"),
          ) && <FixtureNotice />}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[15px]">
              <thead>
                <tr className="border-b border-border">
                  <th className="w-48 pr-4 pb-3" />
                  {items.map((o) => (
                    <th
                      key={o.id}
                      scope="col"
                      className="min-w-56 pr-4 pb-3 align-bottom"
                    >
                      <Link
                        href={`/opportunities/${o.id}`}
                        className="font-heading text-lg font-semibold break-words hover:underline hover:underline-offset-4"
                      >
                        {o.cluster}
                      </Link>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(([key, cell]) => (
                  <tr
                    key={key}
                    data-testid="compare-row"
                    className="border-b border-border align-top"
                  >
                    <th
                      scope="row"
                      className="py-3 pr-4 text-xs font-semibold tracking-[1px] text-muted-foreground uppercase"
                    >
                      {label(key)}
                    </th>
                    {items.map((o) => (
                      <td key={o.id} className="py-3 pr-4">
                        {cell(o)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </main>
  );
}
