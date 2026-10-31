import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import type { PageKind } from "@repo/research/page-judge";
import type { PoolCheckDto, PoolKeywordDto } from "@repo/research/pool-dto";
import type { TrendCheck } from "@repo/research/pool-trend";
import { Tag } from "@repo/ui/components/badge";

import { LocalDateTime } from "@/components/local-date-time";
import { BriefPanel } from "@/features/opportunities/brief-panel";
import { PoolStatusBadge, Reasons } from "@/features/pool/pool-badges";
import {
  count,
  displayUrl,
  trendSummary,
  usd,
} from "@/features/pool/pool-format";
import { RecheckKeyword } from "@/features/pool/recheck-keyword";
import { ReviewActions } from "@/features/pool/review-actions";
import { apiGet, apiRequest } from "@/server/api/api";

type Detail = PoolKeywordDto & { checks: PoolCheckDto[] };
type SerpRow = {
  rank: number;
  site: string;
  url: string;
  title: string;
  traffic: number | null;
  /** The page check's reading (S71); absent before it or without AI budget. */
  page?: {
    /** Absent in checks from before the access split: those were all judged. */
    access?: "ok" | "gone" | "unreadable";
    madeForPhrase: boolean | null;
    kind: PageKind | null;
    weak: boolean;
    note: string;
    title: string | null;
    status: number | null;
  };
};

export async function generateMetadata({
  params,
}: PageProps<"/keywords/[id]">) {
  const { id } = await params;
  const k = await apiGet<Detail>(`/api/pool/keywords/${id}`).catch(() => null);
  return { title: k?.phrase ?? (await getTranslations("pool"))("metaTitle") };
}

// One keyword with its data, its checks and the maintainer's actions.
export default async function PoolKeywordPage({
  params,
}: PageProps<"/keywords/[id]">) {
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
        | {
            serp?: {
              results?: SerpRow[];
              strongSites?: string[];
              pageCheck?: string | null;
            };
          }
        | undefined
    )?.serp ?? null;
  const autocomplete =
    (deep?.data as { autocomplete?: string[] | null } | undefined)
      ?.autocomplete ?? null;
  const strong = new Set(serp?.strongSites ?? []);
  // The check the numbers above come from: an import keeps keyword-lab's numbers.
  const numbersFrom = k.checks.find((c) =>
    ["import", "screen", "deep"].includes(c.kind),
  );
  const lab =
    numbersFrom?.kind === "import"
      ? ((
          numbersFrom.data as {
            keywordLab?: { round?: string; date?: string; reason?: string };
          } | null
        )?.keywordLab ?? null)
      : null;
  const checkedAs = /checked as "([^"]+)"/.exec(lab?.reason ?? "")?.[1];
  // The third item is a hint shown on hover.
  const facts: [string, string, string?][] = [
    [t("column.volume"), count(k.searchVolume)],
    [
      t("kdReference"),
      k.keywordDifficulty == null ? "—" : String(k.keywordDifficulty),
      t("kdHint"),
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
        href="/keywords"
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

      <div className="flex flex-wrap items-start justify-between gap-4">
        <p className="max-w-3xl text-[13px] text-muted-foreground">
          {lab
            ? t("provenance.imported", {
                date: lab.date ?? numbersFrom!.createdAt.slice(0, 10),
                round: lab.round ?? "—",
              })
            : numbersFrom
              ? t("provenance.termrise", {
                  date: numbersFrom.createdAt.slice(0, 10),
                })
              : null}
          {lab && checkedAs && checkedAs !== k.phrase && (
            <> {t("provenance.checkedAs", { phrase: checkedAs })}</>
          )}
          {lab && <> {t("provenance.labNote")}</>}
        </p>
        <RecheckKeyword id={k.id} phrase={k.phrase} />
      </div>

      <dl className="grid grid-cols-2 gap-6 border-y border-border py-6 md:grid-cols-6">
        {facts.map(([label, value, hint]) => (
          <div key={label} className="space-y-1">
            <dt className="text-[13px] text-muted-foreground">
              {hint ? (
                <span
                  title={hint}
                  className="cursor-help underline decoration-dotted underline-offset-4"
                >
                  {label}
                </span>
              ) : (
                label
              )}
            </dt>
            <dd className="font-mono text-xl font-semibold tabular-nums">
              {value}
            </dd>
          </div>
        ))}
      </dl>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <div className="min-w-0 space-y-10">
          {trend && (
            <section aria-labelledby="trend-title" className="space-y-2">
              <h2
                id="trend-title"
                className="font-heading text-xl font-semibold"
              >
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
              <h2
                id="serp-title"
                className="font-heading text-xl font-semibold"
              >
                {t("serpTitle")}
              </h2>
              <p className="text-[13px] text-muted-foreground">
                {serp.pageCheck ? t("pageCheck.on") : t("pageCheck.off")}
              </p>
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
                      <span className="block font-mono text-[12px] break-all text-muted-foreground">
                        {displayUrl(r.url) ?? t("viaGoogle", { site: r.site })}
                      </span>
                      {r.traffic != null && (
                        <span className="block text-[13px] text-muted-foreground">
                          {t("traffic", {
                            visits: count(Math.round(r.traffic)),
                          })}
                        </span>
                      )}
                      {r.page && (
                        <span className="flex flex-wrap items-center gap-1.5 pt-1 text-[13px]">
                          {r.page.access === "unreadable" && (
                            <Tag>{t("pageCheck.unreadable")}</Tag>
                          )}
                          {r.page.access === "gone" && (
                            <Tag>{t("pageCheck.gone")}</Tag>
                          )}
                          {r.page.kind && (
                            <Tag>{t(`pageKind.${r.page.kind}`)}</Tag>
                          )}
                          {r.page.madeForPhrase && (
                            <Tag tone="brand">{t("pageCheck.madeFor")}</Tag>
                          )}
                          {r.page.weak && r.page.access !== "gone" && (
                            <Tag>{t("pageCheck.weak")}</Tag>
                          )}
                          <span className="text-muted-foreground">
                            {r.page.note}
                          </span>
                        </span>
                      )}
                    </span>
                    {strong.has(r.site) && (
                      <Tag tone="brand">{t("strong")}</Tag>
                    )}
                  </li>
                ))}
              </ol>
            </section>
          )}

          {autocomplete && autocomplete.length > 0 && (
            <section aria-labelledby="autocomplete-title" className="space-y-3">
              <h2
                id="autocomplete-title"
                className="font-heading text-xl font-semibold"
              >
                {t("autocompleteTitle")}
              </h2>
              <p className="text-[13px] text-muted-foreground">
                {t("autocompleteBody")}
              </p>
              <div className="flex flex-wrap gap-2">
                {autocomplete.map((s) => (
                  <Tag key={s}>{s}</Tag>
                ))}
              </div>
            </section>
          )}

          {brief?.markdown && (
            <section aria-labelledby="brief-title" className="space-y-4">
              <div className="space-y-1">
                <h2
                  id="brief-title"
                  className="font-heading text-xl font-semibold"
                >
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
            <h2
              id="checks-title"
              className="font-heading text-xl font-semibold"
            >
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
                        href={`/keywords/rounds/${c.roundId}`}
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
        </div>
        <aside className="space-y-8 lg:sticky lg:top-24">
          <ReviewActions keyword={k} />
          {(k.monetization || k.compliance || k.aiAngle) && (
            <dl className="grid gap-4">
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
        </aside>
      </div>
    </main>
  );
}
