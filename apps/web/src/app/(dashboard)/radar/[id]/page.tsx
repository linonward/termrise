import { ArrowLeft, ExternalLink } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import type {
  RadarItemDto,
  RadarObservationDto,
} from "@repo/research/radar-dto";
import { PROJECT_NAME_MAX_LENGTH } from "@repo/research/research-rules";
import { Button } from "@repo/ui/components/button";

import { StarButton } from "@/components/favorites/star-button";
import { LocalDateTime } from "@/components/local-date-time";
import {
  DiscussionNotice,
  LifecycleBadge,
  SourceBadge,
} from "@/features/radar/radar-badges";
import { apiRequest } from "@/server/api/api";

type RadarDetail = RadarItemDto & { observations: RadarObservationDto[] };

async function loadItem(id: string) {
  const response = await apiRequest(
    `/api/radar/items/${encodeURIComponent(id)}`,
  );
  if (response.status === 404) notFound();
  if (!response.ok)
    throw new Error(`API /api/radar/items failed: ${response.status}`);
  return (await response.json()) as RadarDetail;
}

export async function generateMetadata({ params }: PageProps<"/radar/[id]">) {
  return { title: (await loadItem((await params).id)).title };
}

// One radar item: its links, what the system saw, and a research project from it
// (docs/product/ux.md#radar).
export default async function RadarItemPage({
  params,
}: PageProps<"/radar/[id]">) {
  const item = await loadItem((await params).id);
  const t = await getTranslations("radar");
  const research = new URLSearchParams({
    name: item.title.slice(0, PROJECT_NAME_MAX_LENGTH),
    seed: item.suggestedSeed,
  });
  const facts = [
    ["posted", item.postedAt && <LocalDateTime iso={item.postedAt} />],
    ["firstSeen", <LocalDateTime key="f" iso={item.firstSeenAt} />],
    ["lastSeen", <LocalDateTime key="l" iso={item.lastSeenAt} />],
    ["points", item.score],
    ["comments", item.comments],
  ] as const;
  return (
    <main className="mx-auto w-full max-w-310 space-y-8 px-5 py-8 md:space-y-10 md:py-16">
      <header className="space-y-4">
        <Link
          href="/radar"
          className="flex w-fit items-center gap-1 text-[15px] font-medium"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          {t("back")}
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <StarButton
            path={`/api/radar/items/${item.id}/star`}
            starred={item.starred}
            name={item.title}
          />
          <h1 className="font-heading text-[28px] font-bold tracking-tight break-words md:text-4xl">
            {item.title}
          </h1>
          <SourceBadge provider={item.provider} />
          <LifecycleBadge lifecycle={item.lifecycle} />
        </div>
        <p
          className="text-[15px] text-muted-foreground"
          data-testid="lifecycle-help"
        >
          {t(`lifecycleHelp.${item.lifecycle}`)}
        </p>
        <div className="flex flex-wrap gap-4 text-[15px] font-medium">
          {item.url && (
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="flex items-center gap-1 underline underline-offset-4"
            >
              {t("openLink")}
              <ExternalLink aria-hidden="true" className="size-4" />
            </a>
          )}
          <a
            href={item.discussionUrl}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="flex items-center gap-1 underline underline-offset-4"
          >
            {t("openDiscussion")}
            <ExternalLink aria-hidden="true" className="size-4" />
          </a>
        </div>
      </header>
      <DiscussionNotice />
      <div className="flex flex-col gap-8 md:flex-row md:items-start md:gap-12">
        <section
          aria-labelledby="observations-title"
          className="min-w-0 flex-1 space-y-4"
        >
          <h2
            id="observations-title"
            className="font-heading text-2xl font-semibold"
          >
            {t("observations")}
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[15px]">
              <thead>
                <tr className="border-b border-border text-xs font-semibold tracking-[1px] text-muted-foreground uppercase">
                  {(
                    [
                      "observedAt",
                      "list",
                      "rank",
                      "points",
                      "comments",
                    ] as const
                  ).map((key) => (
                    <th
                      key={key}
                      className={
                        key === "observedAt" || key === "list"
                          ? "pr-4 pb-3 font-semibold"
                          : "pr-4 pb-3 text-right font-semibold"
                      }
                    >
                      {t(`column.${key}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {item.observations.map((o) => (
                  <tr
                    key={`${o.observedAt}-${o.list}`}
                    data-testid="observation-row"
                    className="border-b border-border"
                  >
                    <td className="py-3 pr-4 whitespace-nowrap text-muted-foreground">
                      <LocalDateTime iso={o.observedAt} />
                    </td>
                    <td className="py-3 pr-4">{t(`list.${o.list}`)}</td>
                    <td className="py-3 pr-4 text-right tabular-nums">
                      {o.rank}
                    </td>
                    <td className="py-3 pr-4 text-right tabular-nums">
                      {o.score ?? "—"}
                    </td>
                    <td className="py-3 pr-4 text-right tabular-nums">
                      {o.comments ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <aside className="space-y-6 md:w-100">
          <dl className="space-y-3 rounded-lg border border-border p-6 text-[15px]">
            {facts.map(([key, value]) => (
              <div key={key} className="flex justify-between gap-4">
                <dt className="text-muted-foreground">{t(`column.${key}`)}</dt>
                <dd className="text-right tabular-nums">
                  {value ?? (
                    <span className="text-subtle-foreground">
                      {t("noData")}
                    </span>
                  )}
                </dd>
              </div>
            ))}
          </dl>
          <section
            aria-labelledby="research-title"
            className="space-y-3 rounded-lg border border-border p-6"
          >
            <h2
              id="research-title"
              className="font-heading text-xl font-semibold"
            >
              {t("researchTitle")}
            </h2>
            <p className="text-[15px] text-muted-foreground">
              {t("researchBody", { seed: item.suggestedSeed })}
            </p>
            <Button asChild className="h-10 w-full px-4">
              <Link href={`/research?${research}`}>{t("startResearch")}</Link>
            </Button>
          </section>
        </aside>
      </div>
    </main>
  );
}
