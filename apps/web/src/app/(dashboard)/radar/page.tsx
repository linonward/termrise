import Link from "next/link";
import { getTranslations } from "next-intl/server";

import type { RadarItemDto } from "@repo/research/radar-dto";
import { RADAR_SORTS, type RadarSort } from "@repo/research/radar-rules";
import { Button } from "@repo/ui/components/button";

import { StarButton } from "@/components/favorites/star-button";
import { LocalDateTime } from "@/components/local-date-time";
import {
  DiscussionNotice,
  LifecycleBadge,
  SourceBadge,
} from "@/features/radar/radar-badges";
import { apiGet } from "@/server/api/api";

export async function generateMetadata() {
  return { title: (await getTranslations("radar"))("metaTitle") };
}

// Stories the worker collects from public sources (docs/product/ux.md#radar).
export default async function RadarPage({ searchParams }: PageProps<"/radar">) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : "";
  const sort: RadarSort = RADAR_SORTS.find((s) => s === params.sort) ?? "new";
  const t = await getTranslations("radar");
  const starred = params.starred === "1";
  const query = new URLSearchParams({
    sort,
    ...(q ? { q } : {}),
    ...(starred ? { starred: "1" } : {}),
  });
  const { items } = await apiGet<{ items: RadarItemDto[] }>(
    `/api/radar/items?${query}`,
  );
  return (
    <main className="mx-auto w-full max-w-310 space-y-8 px-5 py-8 md:space-y-12 md:py-16">
      <header className="space-y-2">
        <h1 className="font-heading text-[28px] font-bold tracking-tight md:text-4xl">
          {t("title")}
        </h1>
        <p className="text-[15px] text-muted-foreground">{t("subtitle")}</p>
      </header>
      <DiscussionNotice />
      <form
        role="search"
        className="flex flex-col gap-4 md:flex-row md:items-end"
      >
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
            {RADAR_SORTS.map((s) => (
              <option key={s} value={s}>
                {t(`sort.${s}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex h-11 items-center gap-2 text-[15px]">
          <input
            type="checkbox"
            name="starred"
            value="1"
            defaultChecked={starred}
            className="size-4 accent-brand"
          />
          {t("starredOnly")}
        </label>
        <Button type="submit" variant="outline" className="h-11 px-4">
          {t("apply")}
        </Button>
      </form>
      {items.length === 0 ? (
        <div className="space-y-1 rounded-lg border border-border p-6">
          {starred && !q ? (
            <p className="text-[15px] text-muted-foreground">
              {t("starredEmpty")}
            </p>
          ) : (
            <>
              <p className="text-[15px] font-medium">
                {q ? t("noMatchTitle") : t("emptyTitle")}
              </p>
              <p className="text-[15px] text-muted-foreground">
                {q ? t("noMatchBody") : t("emptyBody")}
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[15px]">
            <thead>
              <tr className="border-b border-border text-xs font-semibold tracking-[1px] text-muted-foreground uppercase">
                {(
                  [
                    "story",
                    "source",
                    "points",
                    "comments",
                    "firstSeen",
                  ] as const
                ).map((key) => (
                  <th
                    key={key}
                    className={
                      key === "points" || key === "comments"
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
              {items.map((item) => (
                <tr
                  key={item.id}
                  data-testid="radar-row"
                  className="border-b border-border"
                >
                  <td className="py-4 pr-4">
                    <div className="flex items-center gap-1">
                      <StarButton
                        path={`/api/radar/items/${item.id}/star`}
                        starred={item.starred}
                        name={item.title}
                      />
                      <Link
                        href={`/radar/${item.id}`}
                        className="font-semibold break-words hover:underline hover:underline-offset-4"
                      >
                        {item.title}
                      </Link>
                    </div>
                  </td>
                  <td className="py-4 pr-4">
                    <LifecycleBadge lifecycle={item.lifecycle} />
                  </td>
                  <td className="py-4 pr-4">
                    <SourceBadge provider={item.provider} />
                  </td>
                  <td className="py-4 pr-4 text-right tabular-nums">
                    {item.score ?? "—"}
                  </td>
                  <td className="py-4 pr-4 text-right tabular-nums">
                    {item.comments ?? "—"}
                  </td>
                  <td className="py-4 pr-4 whitespace-nowrap text-muted-foreground">
                    <LocalDateTime iso={item.firstSeenAt} />
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
