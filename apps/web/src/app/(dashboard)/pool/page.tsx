import { Library, SearchX } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import type { PoolKeywordDto, PoolRoundDto } from "@repo/research/pool-dto";
import { Button } from "@repo/ui/components/button";
import { cn } from "@repo/ui/utils";

import { EmptyState } from "@/components/empty-state";
import { LocalDateTime } from "@/components/local-date-time";
import { AddIdeas } from "@/features/pool/add-ideas";
import {
  PoolStatusBadge,
  Reasons,
  RoundStatusBadge,
} from "@/features/pool/pool-badges";
import { count, pct, usd } from "@/features/pool/pool-format";
import { StartRound } from "@/features/pool/start-round";
import { apiGet } from "@/server/api/api";

const STATUSES = [
  "candidate",
  "watch",
  "queued",
  "unsure",
  "new",
  "selected",
  "failed",
  "excluded",
  "dropped",
] as const;
const SORTS = ["updated", "volume", "next"] as const;

export async function generateMetadata() {
  return { title: (await getTranslations("pool"))("metaTitle") };
}

// The keyword pool for new tool sites (docs/product/keyword-pool.md).
export default async function PoolPage({ searchParams }: PageProps<"/pool">) {
  const params = await searchParams;
  const status = STATUSES.find((s) => s === params.status);
  const sort = SORTS.find((s) => s === params.sort) ?? "updated";
  const q = typeof params.q === "string" ? params.q : "";
  const page = Math.max(1, Number(params.page) || 1);
  const t = await getTranslations("pool");
  const query = new URLSearchParams({
    sort,
    page: String(page),
    ...(status ? { status } : {}),
    ...(q ? { q } : {}),
  });
  const [list, rounds] = await Promise.all([
    apiGet<{
      items: PoolKeywordDto[];
      total: number;
      counts: Partial<Record<PoolKeywordDto["status"], number>>;
    }>(`/api/pool/keywords?${query}`),
    apiGet<{ items: PoolRoundDto[] }>("/api/pool/rounds"),
  ]);
  const open = rounds.items.some(
    (r) => r.status === "queued" || r.status === "running",
  );
  const all = Object.values(list.counts).reduce((a, b) => a + (b ?? 0), 0);
  const href = (next: Record<string, string | undefined>) => {
    const p = new URLSearchParams({
      ...(status ? { status } : {}),
      ...(q ? { q } : {}),
      sort,
      ...next,
    });
    for (const [k, v] of [...p.entries()]) if (!v) p.delete(k);
    return `/pool?${p}`;
  };
  const pages = Math.max(1, Math.ceil(list.total / 50));

  return (
    <main className="mx-auto w-full max-w-310 space-y-8 px-5 py-8 md:space-y-12 md:py-16">
      <header className="space-y-2">
        <h1 className="font-heading text-[28px] font-semibold tracking-tight md:text-4xl">
          {t("title")}
        </h1>
        <p className="text-[15px] text-muted-foreground">{t("subtitle")}</p>
      </header>

      <div className="grid gap-8 md:grid-cols-2">
        <section aria-labelledby="round-title" className="space-y-3">
          <h2 id="round-title" className="font-heading text-xl font-semibold">
            {t("roundTitle")}
          </h2>
          <StartRound open={open} />
          {rounds.items.length > 0 && (
            <ul className="divide-y divide-border border-y border-border text-[15px]">
              {rounds.items.slice(0, 5).map((r) => (
                <li
                  key={r.id}
                  className="flex flex-wrap items-center gap-3 py-3"
                >
                  <RoundStatusBadge status={r.status} />
                  <Link
                    href={`/pool/rounds/${r.id}`}
                    className="font-medium hover:underline hover:underline-offset-4"
                  >
                    {r.source ?? t("roundNoSource")}
                  </Link>
                  <span className="text-[13px] text-muted-foreground">
                    {t(`roundKind.${r.kind}`)} ·{" "}
                    <LocalDateTime iso={r.createdAt} /> ·{" "}
                    {usd(r.spentMicros, 3)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section aria-labelledby="add-title" className="space-y-3">
          <h2 id="add-title" className="font-heading text-xl font-semibold">
            {t("addTitle")}
          </h2>
          <AddIdeas />
        </section>
      </div>

      <nav aria-label={t("statusFilter")} className="flex flex-wrap gap-2">
        <Link
          href={href({ status: undefined, page: undefined })}
          aria-current={!status ? "page" : undefined}
          className={cn(
            "rounded-full border border-border px-3 py-1 text-[13px]",
            !status && "border-primary bg-primary text-primary-foreground",
          )}
        >
          {t("all")} {all}
        </Link>
        {STATUSES.map((s) => (
          <Link
            key={s}
            href={href({ status: s, page: undefined })}
            aria-current={status === s ? "page" : undefined}
            className={cn(
              "rounded-full border border-border px-3 py-1 text-[13px]",
              status === s &&
                "border-primary bg-primary text-primary-foreground",
            )}
          >
            {t(`status.${s}`)} {list.counts[s] ?? 0}
          </Link>
        ))}
      </nav>

      <form
        role="search"
        className="flex flex-col gap-4 md:flex-row md:items-end"
      >
        {status && <input type="hidden" name="status" value={status} />}
        <label className="block flex-1 space-y-2 text-[13px] font-medium">
          <span>{t("search")}</span>
          <input
            name="q"
            type="search"
            defaultValue={q}
            maxLength={100}
            className="h-11 w-full rounded-md border border-border-strong bg-background px-4 text-[15px] focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
          />
        </label>
        <label className="block space-y-2 text-[13px] font-medium md:w-48">
          <span>{t("sortLabel")}</span>
          <select
            name="sort"
            defaultValue={sort}
            className="h-11 w-full rounded-md border border-border-strong bg-background px-4 text-[15px] focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
          >
            {SORTS.map((s) => (
              <option key={s} value={s}>
                {t(`sort.${s}`)}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" variant="outline" className="h-11 px-4">
          {t("apply")}
        </Button>
      </form>

      {list.items.length === 0 ? (
        <EmptyState
          icon={q ? SearchX : Library}
          title={q ? t("noMatchTitle") : t("emptyTitle")}
          body={q ? t("noMatchBody") : t("emptyBody")}
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[15px]">
            <thead>
              <tr className="border-b border-border text-xs font-semibold tracking-[1px] text-muted-foreground uppercase">
                {(
                  [
                    "keyword",
                    "status",
                    "volume",
                    "kd",
                    "cpc",
                    "strong",
                    "trend",
                    "variants",
                    "next",
                  ] as const
                ).map((key) => (
                  <th
                    key={key}
                    className={cn(
                      "pr-4 pb-3 font-semibold",
                      !["keyword", "status", "next"].includes(key) &&
                        "text-right",
                    )}
                  >
                    {t(`column.${key}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.items.map((k) => {
                const trend = k.trend as {
                  relativeChange: number | null;
                  recentChange: number | null;
                } | null;
                return (
                  <tr
                    key={k.id}
                    data-testid="pool-row"
                    className="border-b border-border align-top"
                  >
                    <td className="py-4 pr-4">
                      <Link
                        href={`/pool/${k.id}`}
                        className="font-semibold break-words hover:underline hover:underline-offset-4"
                      >
                        {k.phrase}
                      </Link>
                      <div className="mt-1">
                        <Reasons reasons={k.reasons} />
                      </div>
                    </td>
                    <td className="py-4 pr-4">
                      <PoolStatusBadge status={k.status} />
                    </td>
                    <td className="py-4 pr-4 text-right font-mono text-sm tabular-nums">
                      {count(k.searchVolume)}
                    </td>
                    <td className="py-4 pr-4 text-right font-mono text-sm tabular-nums">
                      {k.keywordDifficulty ?? "—"}
                    </td>
                    <td className="py-4 pr-4 text-right font-mono text-sm tabular-nums">
                      {usd(k.cpcMicros)}
                    </td>
                    <td className="py-4 pr-4 text-right font-mono text-sm tabular-nums">
                      {k.strongCompetitors ?? "—"}
                    </td>
                    <td className="py-4 pr-4 text-right font-mono text-sm tabular-nums">
                      {pct(trend?.relativeChange ?? trend?.recentChange)}
                    </td>
                    <td className="py-4 pr-4 text-right font-mono text-sm tabular-nums">
                      {count(k.variantCount)}
                    </td>
                    <td className="py-4 pr-4 whitespace-nowrap text-muted-foreground">
                      {k.nextCheckAt ? (
                        <LocalDateTime iso={k.nextCheckAt} />
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {pages > 1 && (
        <nav
          aria-label={t("pages")}
          className="flex items-center gap-4 text-[15px]"
        >
          {page > 1 && (
            <Link href={href({ page: String(page - 1) })}>{t("prev")}</Link>
          )}
          <span className="text-muted-foreground">
            {t("pageOf", { page, pages })}
          </span>
          {page < pages && (
            <Link href={href({ page: String(page + 1) })}>{t("next")}</Link>
          )}
        </nav>
      )}
    </main>
  );
}
