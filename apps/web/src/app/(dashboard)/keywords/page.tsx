import { Library, SearchX } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import type { PoolKeywordDto, PoolRoundDto } from "@repo/research/pool-dto";
import { cn } from "@repo/ui/utils";

import { EmptyState } from "@/components/empty-state";
import { LocalDateTime } from "@/components/local-date-time";
import { DiscoverHeader } from "@/features/discover/discover-header";
import { AddIdeas } from "@/features/pool/add-ideas";
import {
  PoolStatusBadge,
  Reasons,
  RoundStatusBadge,
} from "@/features/pool/pool-badges";
import { count, pct, shortDate, usd } from "@/features/pool/pool-format";
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
const SORTS = ["updated", "checked", "seen", "volume", "next"] as const;

export async function generateMetadata() {
  return { title: (await getTranslations("pool"))("metaTitle") };
}

// The keyword pool for new tool sites (docs/product/keyword-pool.md).
export default async function PoolPage({
  searchParams,
}: PageProps<"/keywords">) {
  const params = await searchParams;
  // The default view is what waits for the maintainer: candidates and rising words.
  const status =
    params.status === "all"
      ? "all"
      : (STATUSES.find((s) => s === params.status) ?? "review");
  const sort = SORTS.find((s) => s === params.sort) ?? "updated";
  const q = typeof params.q === "string" ? params.q : "";
  const page = Math.max(1, Number(params.page) || 1);
  const t = await getTranslations("pool");
  const query = new URLSearchParams({
    sort,
    page: String(page),
    status,
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
  // New-word rounds have their own page: here only the evergreen ones.
  const evergreen = rounds.items.filter((r) => r.kind !== "new_words");
  const latest = evergreen[0] ?? null;
  const open = evergreen.some(
    (r) => r.status === "queued" || r.status === "running",
  );
  const all = Object.values(list.counts).reduce((a, b) => a + (b ?? 0), 0);
  const waiting = (list.counts.candidate ?? 0) + (list.counts.watch ?? 0);
  const href = (next: Record<string, string | undefined>) => {
    const p = new URLSearchParams({
      ...(status ? { status } : {}),
      ...(q ? { q } : {}),
      sort,
      ...next,
    });
    for (const [k, v] of [...p.entries()]) if (!v) p.delete(k);
    return `/keywords?${p}`;
  };
  const pages = Math.max(1, Math.ceil(list.total / 50));

  return (
    <main className="mx-auto w-full max-w-310 space-y-8 px-5 py-8 md:space-y-12 md:py-16">
      <DiscoverHeader current="evergreen">
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div className="space-y-2">
            <p className="max-w-2xl text-[15px] text-muted-foreground">
              {t("subtitle")}
            </p>
            {latest && (
              <p className="flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
                {t("lastRound")}
                <RoundStatusBadge status={latest.status} />
                <Link
                  href={`/keywords/rounds/${latest.id}`}
                  className="font-medium text-foreground hover:underline hover:underline-offset-4"
                >
                  {latest.source ?? t("roundNoSource")}
                </Link>
                <span>
                  <LocalDateTime iso={latest.createdAt} /> ·{" "}
                  {usd(latest.spentMicros, 3)}
                </span>
              </p>
            )}
          </div>
          <div className="shrink-0 space-y-3 md:w-80">
            <StartRound open={open} />
            <details className="text-[13px]">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                {t("addTitle")}
              </summary>
              <div className="mt-3">
                <AddIdeas />
              </div>
            </details>
          </div>
        </div>
      </DiscoverHeader>

      <nav
        aria-label={t("statusFilter")}
        className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 md:mx-0 md:flex-wrap md:overflow-visible md:px-0"
      >
        {(
          [
            ["review", t("reviewTab"), waiting],
            ["all", t("all"), all],
          ] as const
        ).map(([key, label, n]) => (
          <Link
            key={key}
            href={href({ status: key, page: undefined })}
            aria-current={status === key ? "page" : undefined}
            className={cn(
              "shrink-0 rounded-full border border-border px-3 py-1 text-[13px] whitespace-nowrap",
              status === key &&
                "border-primary bg-primary text-primary-foreground",
            )}
          >
            {label} {n}
          </Link>
        ))}
        {STATUSES.map((s) => (
          <Link
            key={s}
            href={href({ status: s, page: undefined })}
            aria-current={status === s ? "page" : undefined}
            className={cn(
              "shrink-0 rounded-full border border-border px-3 py-1 text-[13px] whitespace-nowrap",
              status === s &&
                "border-primary bg-primary text-primary-foreground",
            )}
          >
            {t(`status.${s}`)} {list.counts[s] ?? 0}
          </Link>
        ))}
      </nav>

      {/* The same filter bar as the find section's other tabs (S92). */}
      <form role="search" className="flex flex-wrap items-center gap-3">
        {status && <input type="hidden" name="status" value={status} />}
        <label className="block flex-1 basis-64">
          <span className="sr-only">{t("search")}</span>
          <input
            name="q"
            type="search"
            defaultValue={q}
            maxLength={100}
            placeholder={t("searchPlaceholder")}
            className="h-11 w-full rounded-md border border-border-strong bg-background px-4 text-[15px] focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
          />
        </label>
        <label className="flex items-center gap-2 text-[15px]">
          <span className="text-muted-foreground">{t("sortLabel")}</span>
          <select
            name="sort"
            defaultValue={sort}
            className="h-11 rounded-md border border-border-strong bg-background px-3 text-[15px]"
          >
            {SORTS.map((s) => (
              <option key={s} value={s}>
                {t(`sort.${s}`)}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="h-11 rounded-md border border-border-strong px-4 text-[15px]"
        >
          {t("apply")}
        </button>
      </form>

      {list.items.length === 0 ? (
        <EmptyState
          icon={q ? SearchX : Library}
          title={
            q
              ? t("noMatchTitle")
              : status === "review"
                ? t("reviewEmptyTitle")
                : t("emptyTitle")
          }
          body={
            q
              ? t("noMatchBody")
              : status === "review"
                ? t("reviewEmptyBody")
                : t("emptyBody")
          }
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
                      "pr-4 pb-3 font-semibold whitespace-nowrap",
                      !["keyword", "status", "next"].includes(key) &&
                        "text-right",
                    )}
                    title={key === "kd" ? t("kdHint") : undefined}
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
                        href={`/keywords/${k.id}`}
                        className="font-semibold break-words hover:underline hover:underline-offset-4"
                      >
                        {k.phrase}
                      </Link>
                      <div className="mt-1 max-w-md">
                        <Reasons reasons={k.reasons} compact />
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
                      {shortDate(k.nextCheckAt)}
                      <span className="block text-[12px]">
                        {t("seenChecked", {
                          seen: shortDate(k.firstSeenAt),
                          checked: shortDate(k.lastCheckedAt),
                        })}
                      </span>
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
