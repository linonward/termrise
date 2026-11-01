import { Globe, SearchX } from "lucide-react";
import { getTranslations } from "next-intl/server";

import type { LaunchSiteDto } from "@repo/research/launch-site-dto";
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
import { apiGet } from "@/server/api/api";

const MOTIVES = [
  "keyword",
  "own_pain",
  "others_need",
  "hobby",
  "business",
  "unstated",
] as const;
type Motive = (typeof MOTIVES)[number];

export async function generateMetadata() {
  return { title: (await getTranslations("discover"))("sitesMetaTitle") };
}

// New sites their makers launched on Show HN (docs/product/keyword-pool.md#launch-sites).
export default async function LaunchSitesPage({
  searchParams,
}: PageProps<"/discover/sites">) {
  const params = await searchParams;
  const motive = MOTIVES.find((m) => m === params.motive);
  const q = typeof params.q === "string" ? params.q : "";
  const hidden = params.hidden === "1";
  const t = await getTranslations("discover");
  const query = new URLSearchParams({
    ...(motive ? { motive } : {}),
    ...(q ? { q } : {}),
    ...(hidden ? { hidden: "1" } : {}),
  });
  const data = await apiGet<{
    items: LaunchSiteDto[];
    total: number;
    counts: Record<string, number>;
    lastRound: { status: string; createdAt: string } | null;
  }>(`/api/pool/launch-sites?${query}`);
  const all = Object.values(data.counts).reduce((a, b) => a + b, 0);
  const href = (next: { motive?: Motive }) => {
    const p = new URLSearchParams({
      ...(next.motive ? { motive: next.motive } : {}),
      ...(q ? { q } : {}),
      ...(hidden ? { hidden: "1" } : {}),
    });
    return `/discover/sites${p.size ? `?${p}` : ""}`;
  };

  return (
    <main className="mx-auto w-full max-w-310 space-y-8 px-5 py-8 md:py-16">
      <DiscoverHeader current="sites">
        <TabIntro intro={t("sitesIntro")}>
          <RoundDot ok={data.lastRound?.status === "completed"} />
          {t("sitesSchedule")}
          {data.lastRound && (
            <>
              {" · "}
              {t("sitesLastRound")}{" "}
              <LocalDateTime iso={data.lastRound.createdAt} />
            </>
          )}
          {" · "}
          {t("sitesTotal", { n: all })}
        </TabIntro>
      </DiscoverHeader>

      <FilterChips
        label={t("motiveFilter")}
        chips={[undefined, ...MOTIVES].map((m) => ({
          key: m ?? "all",
          label: m ? t(`motive.${m}`) : t("all"),
          n: m ? (data.counts[m] ?? 0) : all,
          href: href({ motive: m }),
          active: motive === m,
        }))}
      />

      <form role="search" className="flex flex-wrap items-center gap-3">
        {motive && <input type="hidden" name="motive" value={motive} />}
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
      <p className="text-[13px] text-muted-foreground">{t("statedNote")}</p>

      {data.items.length === 0 ? (
        <EmptyState
          icon={q ? SearchX : Globe}
          title={q ? t("noMatchTitle") : t("sitesEmptyTitle")}
          body={q ? t("noMatchBody") : t("sitesEmptyBody")}
        />
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-card px-5 md:px-8">
          {data.items.map((s) => (
            <li
              key={s.id}
              data-testid="launch-site-row"
              className="relative space-y-2 py-6 pr-10"
            >
              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={s.url}
                  target="_blank"
                  rel="noreferrer nofollow"
                  className="text-lg font-semibold break-all hover:underline hover:underline-offset-4"
                >
                  {s.site}
                </a>
                <Tag>HN</Tag>
                {s.category && (
                  <Tag>{t(`category.${s.category as "tool"}`)}</Tag>
                )}
                {s.analyzed && <Tag>{t(s.stated ? "stated" : "inferred")}</Tag>}
              </div>
              <p className="text-[15px] text-muted-foreground">{s.postTitle}</p>
              {s.analyzed ? (
                <>
                  <p className="text-[15px]">
                    {s.about}
                    {s.audience && (
                      <span className="text-muted-foreground">
                        {t("forWhom", { audience: s.audience })}
                      </span>
                    )}
                  </p>
                  <p className="text-[15px]">
                    <span className="text-muted-foreground">{t("why")}</span>
                    {s.why}
                  </p>
                  {s.coreKeyword && (
                    <p className="text-[15px]">
                      <span className="text-muted-foreground">
                        {t("coreKeyword")}
                      </span>
                      <span className="text-brand">{s.coreKeyword}</span>
                      {s.keywordNote && (
                        <span className="text-muted-foreground">
                          （{s.keywordNote}）
                        </span>
                      )}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-[13px] text-muted-foreground">
                  {t("pending")}
                </p>
              )}
              <p className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-muted-foreground">
                <span className="font-mono tabular-nums">
                  {t("points", {
                    score: s.score ?? 0,
                    comments: s.comments ?? 0,
                  })}
                </span>
                {s.postedAt && <LocalDateTime iso={s.postedAt} />}
                {s.registeredOn && (
                  <span>
                    {t("registered", { month: s.registeredOn.slice(0, 7) })}
                  </span>
                )}
                {s.monetization && (
                  <span>{t("monetization", { how: s.monetization })}</span>
                )}
                <a
                  href={s.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-foreground hover:underline"
                >
                  {t("hnDiscussion")}
                </a>
              </p>
              <div className="absolute top-5 right-0">
                <HideSite id={s.id} hidden={s.hidden} site={s.site} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
