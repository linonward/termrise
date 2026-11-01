import { Layers, SearchX } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import type { PlatformSiteDto } from "@repo/research/platform-site-dto";
import { Tag } from "@repo/ui/components/badge";

import { EmptyState } from "@/components/empty-state";
import { LocalDateTime } from "@/components/local-date-time";
import { DiscoverHeader } from "@/features/discover/discover-header";
import {
  FilterChips,
  RoundDot,
  TabIntro,
} from "@/features/discover/filter-chips";
import { HideSite } from "@/features/launch-sites/hide-site";
import { count } from "@/features/pool/pool-format";
import { apiGet } from "@/server/api/api";

const PLATFORMS = ["vercel.app", "github.io", "pages.dev"] as const;
type Platform = (typeof PLATFORMS)[number];
const PAGE_SIZE = 50;

export async function generateMetadata() {
  return { title: (await getTranslations("discover"))("platformsMetaTitle") };
}

// Sites with Google traffic on free hosting platforms, with their visits month by month
// (docs/product/keyword-pool.md#platform-sites).
export default async function PlatformSitesPage({
  searchParams,
}: PageProps<"/discover/platforms">) {
  const params = await searchParams;
  const platform = PLATFORMS.find((p) => p === params.platform);
  const q = typeof params.q === "string" ? params.q : "";
  const hidden = params.hidden === "1";
  const page = Math.max(1, Number(params.page) || 1);
  const t = await getTranslations("discover");
  const filters = {
    ...(q ? { q } : {}),
    ...(hidden ? { hidden: "1" } : {}),
  };
  const data = await apiGet<{
    months: string[];
    items: PlatformSiteDto[];
    total: number;
    counts: Record<string, number>;
    known: number;
    checked: number;
    lastRound: { status: string; createdAt: string } | null;
  }>(
    `/api/pool/platform-sites?${new URLSearchParams({
      ...(platform ? { platform } : {}),
      ...filters,
      ...(page > 1 ? { page: String(page) } : {}),
    })}`,
  );
  const all = Object.values(data.counts).reduce((a, b) => a + b, 0);
  const pages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));
  const href = (next: { platform?: Platform; page?: number }) => {
    const p = new URLSearchParams({
      ...(next.platform ? { platform: next.platform } : {}),
      ...filters,
      ...(next.page && next.page > 1 ? { page: String(next.page) } : {}),
    });
    return `/discover/platforms${p.size ? `?${p}` : ""}`;
  };

  return (
    <main className="mx-auto w-full max-w-310 space-y-8 px-5 py-8 md:py-16">
      <DiscoverHeader current="platforms">
        <TabIntro intro={t("platformsIntro")}>
          <RoundDot ok={data.lastRound?.status === "completed"} />
          {t("platformsSchedule")}
          {data.lastRound && (
            <>
              {" · "}
              {t("sitesLastRound")}{" "}
              <LocalDateTime iso={data.lastRound.createdAt} />
            </>
          )}
          {" · "}
          {t("platformsProgress", {
            known: count(data.known),
            checked: count(data.checked),
          })}
        </TabIntro>
      </DiscoverHeader>

      <FilterChips
        label={t("platformFilter")}
        chips={[undefined, ...PLATFORMS].map((p) => ({
          key: p ?? "all",
          label: p ?? t("all"),
          n: p ? (data.counts[p] ?? 0) : all,
          href: href({ platform: p }),
          active: platform === p,
        }))}
      />

      <form role="search" className="flex flex-wrap items-center gap-3">
        {platform && <input type="hidden" name="platform" value={platform} />}
        <label className="block flex-1 basis-64">
          <span className="sr-only">{t("search")}</span>
          <input
            name="q"
            type="search"
            defaultValue={q}
            maxLength={100}
            placeholder={t("platformsSearchPlaceholder")}
            className="h-11 w-full rounded-md border border-border-strong bg-background px-4 text-[15px] focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
          />
        </label>
        <label className="flex items-center gap-2 text-[15px]">
          <input
            type="checkbox"
            name="hidden"
            value="1"
            defaultChecked={hidden}
            className="size-4.5 accent-primary"
          />
          {t("showHidden")}
        </label>
        <button
          type="submit"
          className="h-11 rounded-md border border-border-strong px-4 text-[15px]"
        >
          {t("apply")}
        </button>
      </form>
      <p className="text-[13px] text-muted-foreground">{t("platformsNote")}</p>

      {data.items.length === 0 ? (
        <EmptyState
          icon={q ? SearchX : Layers}
          title={q ? t("noMatchTitle") : t("platformsEmptyTitle")}
          body={q ? t("noMatchBody") : t("platformsEmptyBody")}
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[15px]">
            <thead>
              <tr className="border-b border-border text-xs font-semibold tracking-[1px] text-muted-foreground">
                <th className="pr-4 pb-3 font-semibold uppercase">
                  {t("column.site")}
                </th>
                <th className="pr-4 pb-3 font-semibold uppercase">
                  {t("column.keyword")}
                </th>
                {data.months.map((m) => (
                  <th
                    key={m}
                    className="pr-4 pb-3 text-right font-mono font-semibold whitespace-nowrap tabular-nums"
                  >
                    {m}
                  </th>
                ))}
                <th className="pb-3">
                  <span className="sr-only">{t("column.hide")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((s) => (
                <tr
                  key={s.id}
                  data-testid="platform-site-row"
                  className="border-b border-border align-top"
                >
                  <td className="max-w-80 py-4 pr-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <a
                        href={`https://${s.host}/`}
                        target="_blank"
                        rel="noreferrer nofollow"
                        className="font-semibold break-all hover:underline hover:underline-offset-4"
                      >
                        {s.host.slice(0, -s.platform.length - 1)}
                      </a>
                      <Tag>{s.platform}</Tag>
                    </div>
                    <p className="mt-1 text-[13px] text-muted-foreground">
                      {s.pageTitle ?? t("noTitle")}
                    </p>
                  </td>
                  <td className="py-4 pr-4">
                    {s.topKeyword ? (
                      <>
                        <span className="text-brand">{s.topKeyword}</span>
                        <p className="mt-1 font-mono text-[13px] text-muted-foreground tabular-nums">
                          {t("keywordFacts", {
                            volume: count(s.topKeywordVolume),
                            rank: s.topKeywordRank ?? "—",
                          })}
                        </p>
                      </>
                    ) : (
                      <span className="text-[13px] text-muted-foreground">
                        {s.keywordChecked
                          ? "—"
                          : (s.etv ?? 0) < 100
                            ? t("keywordPending")
                            : t("keywordNext")}
                      </span>
                    )}
                  </td>
                  {data.months.map((m) => (
                    <td
                      key={m}
                      className="py-4 pr-4 text-right font-mono text-sm whitespace-nowrap tabular-nums"
                    >
                      {s.monthly[m] != null ? (
                        count(Math.round(s.monthly[m]))
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  ))}
                  <td className="py-3">
                    <HideSite
                      id={s.id}
                      hidden={s.hidden}
                      site={s.host}
                      list="platform-sites"
                    />
                  </td>
                </tr>
              ))}
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
            <Link href={href({ platform, page: page - 1 })}>{t("prev")}</Link>
          )}
          <span className="text-muted-foreground">
            {t("pageOf", { page, pages })}
          </span>
          {page < pages && (
            <Link href={href({ platform, page: page + 1 })}>{t("next")}</Link>
          )}
        </nav>
      )}
    </main>
  );
}
