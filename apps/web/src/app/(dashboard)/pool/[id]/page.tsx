import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import type { PoolCheckDto, PoolKeywordDto } from "@repo/research/pool-dto";
import type { TrendCheck } from "@repo/research/pool-trend";
import { Tag } from "@repo/ui/components/badge";

import { LocalDateTime } from "@/components/local-date-time";
import { BriefPanel } from "@/features/opportunities/brief-panel";
import { PoolStatusBadge, Reasons } from "@/features/pool/pool-badges";
import { count, trendSummary, usd } from "@/features/pool/pool-format";
import { ReviewActions } from "@/features/pool/review-actions";
import { apiGet, apiRequest } from "@/server/api/api";

type Detail = PoolKeywordDto & { checks: PoolCheckDto[] };
type SerpRow = {
  rank: number;
  site: string;
  url: string;
  title: string;
  traffic: number | null;
};

export async function generateMetadata({ params }: PageProps<"/pool/[id]">) {
  const { id } = await params;
  const k = await apiGet<Detail>(`/api/pool/keywords/${id}`).catch(() => null);
  return { title: k?.phrase ?? (await getTranslations("pool"))("metaTitle") };
}

// One keyword with its data, its checks and the maintainer's actions.
export default async function PoolKeywordPage({
  params,
}: PageProps<"/pool/[id]">) {
  const { id } = await params;
  const t = await getTranslations("pool");
  const k = await apiGet<Detail>(`/api/pool/keywords/${id}`);
  // The brief is for keywords worth handing to site-starter.
  const brief =
    k.status === "candidate" || k.status === "selected"
      ? await apiRequest(
          `/api/pool/keywords/${encodeURIComponent(id)}/brief.md`,
        ).then(async (r) => ({
          markdown: r.ok ? await r.text() : "",
          fileName:
            /filename="([^"]+)"/.exec(
              r.headers.get("Content-Disposition") ?? "",
            )?.[1] ?? "keyword-brief.md",
        }))
      : null;
  const trend = trendSummary(k.trend as TrendCheck | null);
  const deep = k.checks.find((c) => c.kind === "deep");
  const serp =
    (
      deep?.data as
        { serp?: { results?: SerpRow[]; strongSites?: string[] } } | undefined
    )?.serp ?? null;
  const strong = new Set(serp?.strongSites ?? []);
  const facts: [string, string][] = [
    [t("column.volume"), count(k.searchVolume)],
    [
      t("column.kd"),
      k.keywordDifficulty == null ? "—" : String(k.keywordDifficulty),
    ],
    [t("column.cpc"), usd(k.cpcMicros)],
    [t("column.variants"), count(k.variantCount)],
    [
      t("column.strong"),
      k.strongCompetitors == null ? "—" : String(k.strongCompetitors),
    ],
    [t("innerPages"), k.innerPages == null ? "—" : String(k.innerPages)],
  ];

  return (
    <main className="mx-auto w-full max-w-310 space-y-10 px-5 py-8 md:py-16">
      <Link
        href="/pool"
        className="inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:underline"
      >
        <ChevronLeft aria-hidden="true" className="size-4" />
        {t("back")}
      </Link>
      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-heading text-[28px] font-semibold tracking-tight break-words md:text-4xl">
            {k.phrase}
          </h1>
          <PoolStatusBadge status={k.status} />
        </div>
        <div className="flex flex-wrap gap-2">
          {k.sources.map((s) => (
            <Tag key={s}>{s}</Tag>
          ))}
        </div>
        <Reasons reasons={k.reasons} />
        <p className="text-[13px] text-muted-foreground">
          {t("firstSeen")} <LocalDateTime iso={k.firstSeenAt} />
          {k.nextCheckAt && (
            <>
              {" · "}
              {t("nextCheck")} <LocalDateTime iso={k.nextCheckAt} />
            </>
          )}
        </p>
      </header>

      <dl className="grid grid-cols-2 gap-6 border-y border-border py-6 md:grid-cols-6">
        {facts.map(([label, value]) => (
          <div key={label} className="space-y-1">
            <dt className="text-[13px] text-muted-foreground">{label}</dt>
            <dd className="font-mono text-xl font-semibold tabular-nums">
              {value}
            </dd>
          </div>
        ))}
      </dl>

      {trend && (
        <section aria-labelledby="trend-title" className="space-y-2">
          <h2 id="trend-title" className="font-heading text-xl font-semibold">
            {t("trendTitle")}
          </h2>
          <p className="text-[15px]">
            {trend.relative
              ? t("trendRelative", {
                  recent: trend.recent,
                  baseline: trend.baseline ?? "",
                  relative: trend.relative,
                })
              : t("trendAbsolute", { recent: trend.recent })}
          </p>
          <p className="text-[13px] text-muted-foreground">
            {t("trendDetail", { ratio: trend.ratio, yoy: trend.yoy })}
          </p>
        </section>
      )}

      {k.variants.length > 0 && (
        <section aria-labelledby="variants-title" className="space-y-2">
          <h2
            id="variants-title"
            className="font-heading text-xl font-semibold"
          >
            {t("variantsTitle")}
          </h2>
          <p className="text-[13px] text-muted-foreground">
            {t("variantsBody")}
          </p>
          <div className="flex flex-wrap gap-2">
            {k.variants.map((v) => (
              <Tag key={v}>{v}</Tag>
            ))}
          </div>
        </section>
      )}

      {serp?.results && serp.results.length > 0 && (
        <section aria-labelledby="serp-title" className="space-y-3">
          <h2 id="serp-title" className="font-heading text-xl font-semibold">
            {t("serpTitle")}
          </h2>
          <ol className="divide-y divide-border border-y border-border">
            {serp.results.map((r) => (
              <li key={r.rank} className="flex gap-4 py-3">
                <span className="w-6 shrink-0 font-mono text-sm text-muted-foreground tabular-nums">
                  {r.rank}
                </span>
                <span className="min-w-0 flex-1 space-y-0.5">
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noreferrer nofollow"
                    className="block truncate text-[15px] font-medium hover:underline"
                  >
                    {r.title}
                  </a>
                  <span className="block text-[13px] text-muted-foreground">
                    {r.site}
                    {r.traffic != null &&
                      ` · ${t("traffic", { visits: count(Math.round(r.traffic)) })}`}
                  </span>
                </span>
                {strong.has(r.site) && <Tag tone="brand">{t("strong")}</Tag>}
              </li>
            ))}
          </ol>
        </section>
      )}

      {(k.monetization || k.compliance || k.aiAngle) && (
        <dl className="grid gap-4 md:grid-cols-3">
          {(
            [
              ["h4", k.monetization],
              ["h7", k.compliance],
              ["aiAngle", k.aiAngle],
            ] as const
          ).map(([key, value]) =>
            value ? (
              <div key={key} className="space-y-1">
                <dt className="text-[13px] text-muted-foreground">
                  {t(`answer.${key}`)}
                </dt>
                <dd className="text-[15px]">{value}</dd>
              </div>
            ) : null,
          )}
        </dl>
      )}

      <ReviewActions keyword={k} />

      {brief?.markdown && (
        <section aria-labelledby="brief-title" className="space-y-4">
          <div className="space-y-1">
            <h2 id="brief-title" className="font-heading text-xl font-semibold">
              {t("briefTitle")}
            </h2>
            <p className="text-[15px] text-muted-foreground">
              {t("briefBody")}
            </p>
          </div>
          <BriefPanel markdown={brief.markdown} fileName={brief.fileName} />
        </section>
      )}

      <section aria-labelledby="checks-title" className="space-y-3">
        <h2 id="checks-title" className="font-heading text-xl font-semibold">
          {t("checksTitle")}
        </h2>
        <ol className="divide-y divide-border border-y border-border">
          {k.checks.map((c) => (
            <li key={c.id} className="space-y-1 py-3">
              <div className="flex flex-wrap items-center gap-3 text-[13px]">
                <LocalDateTime iso={c.createdAt} />
                <Tag>{t(`checkKind.${c.kind}`)}</Tag>
                <PoolStatusBadge status={c.status} />
                {c.roundId && (
                  <Link
                    href={`/pool/rounds/${c.roundId}`}
                    className="text-muted-foreground hover:underline"
                  >
                    {t("round")}
                  </Link>
                )}
              </div>
              <Reasons reasons={c.reasons} />
            </li>
          ))}
        </ol>
      </section>
      {k.checks[0] && (
        <p className="text-[13px] text-muted-foreground">
          {t("rules", { rules: k.checks[0].rules })}
        </p>
      )}
    </main>
  );
}
