import { SearchX, Sparkles } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import type { NewWordDto } from "@repo/research/new-word-dto";
import type { PoolRoundDto } from "@repo/research/pool-dto";

import { EmptyState } from "@/components/empty-state";
import { LocalDateTime } from "@/components/local-date-time";
import { DiscoverHeader } from "@/features/discover/discover-header";
import {
  FilterChips,
  RoundDot,
  TabIntro,
} from "@/features/discover/filter-chips";
import { HideWord } from "@/features/new-words/hide-word";
import {
  VerdictLine,
  VerdictReasons,
  WordTags,
} from "@/features/new-words/new-word-badges";
import {
  discoveryLag,
  growthPct,
  lagMessage,
  monthDay,
  rootMessage,
  times,
  type WordStage,
} from "@/features/new-words/new-word-format";
import { Sparkline } from "@/features/new-words/sparkline";
import { StartNewWords } from "@/features/new-words/start-new-words";
import { apiGet } from "@/server/api/api";

const STAGES: WordStage[] = ["decide", "check", "screen", "skip", "hidden"];
const ORIGINS = [
  "model_release",
  "open_source",
  "product_launch",
  "entertainment",
  "news_event",
  "seasonal",
  "platform_change",
  "unknown",
] as const;
const PAGE_SIZE = 50;

export async function generateMetadata() {
  return { title: (await getTranslations("newWords"))("metaTitle") };
}

// New words by stage (S74): waiting for the maintainer first, then the pipeline behind
// them (docs/product/keyword-pool.md#new-words).
export default async function NewWordsPage({
  searchParams,
}: PageProps<"/discover">) {
  const params = await searchParams;
  const stage = STAGES.find((s) => s === params.stage) ?? "decide";
  const origin = ORIGINS.find((o) => o === params.origin);
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const page = Math.max(1, Number(params.page) || 1);
  const t = await getTranslations("newWords");
  const [list, rounds] = await Promise.all([
    apiGet<{
      items: NewWordDto[];
      total: number;
      counts: Record<WordStage, number>;
      origins: Record<string, number>;
    }>(
      `/api/pool/new-words?${new URLSearchParams({
        stage,
        ...(origin ? { origin } : {}),
        ...(q ? { q } : {}),
        ...(page > 1 ? { page: String(page) } : {}),
      })}`,
    ),
    apiGet<{ items: PoolRoundDto[] }>("/api/pool/rounds"),
  ]);
  const latest = rounds.items.find((r) => r.kind === "new_words");
  const open = rounds.items.some(
    (r) =>
      r.kind === "new_words" &&
      (r.status === "queued" || r.status === "running"),
  );
  const pages = Math.max(1, Math.ceil(list.total / PAGE_SIZE));
  const href = (next: { stage?: WordStage; page?: number }) => {
    const p = new URLSearchParams({
      ...(next.stage && next.stage !== "decide" ? { stage: next.stage } : {}),
      ...(origin ? { origin } : {}),
      ...(q ? { q } : {}),
      ...(next.page && next.page > 1 ? { page: String(next.page) } : {}),
    });
    return `/discover${p.size ? `?${p}` : ""}`;
  };
  const origins = ORIGINS.filter((o) => list.origins[o] || o === origin);
  const tDiscover = await getTranslations("discover");

  return (
    <main className="mx-auto w-full max-w-310 space-y-8 px-5 py-8 md:py-16">
      <DiscoverHeader current="words">
        <TabIntro
          intro={tDiscover("wordsIntro")}
          action={<StartNewWords open={open} />}
        >
          {latest && (
            <>
              <RoundDot ok={latest.status === "completed"} />
              {t("lastRound")}
              <Link
                href={`/keywords/rounds/${latest.id}`}
                className="hover:text-foreground hover:underline"
              >
                <LocalDateTime iso={latest.createdAt} />
              </Link>
            </>
          )}
        </TabIntro>
      </DiscoverHeader>

      <div className="space-y-4">
        <FilterChips
          label={t("stageFilter")}
          chips={STAGES.map((s) => ({
            key: s,
            label: t(`stage.${s}`),
            n: list.counts[s],
            href: href({ stage: s }),
            active: stage === s,
          }))}
        />
        <p className="text-[13px] text-muted-foreground">
          {t(`stageHint.${stage}`)}
        </p>
        <form role="search" className="flex flex-wrap items-center gap-3">
          {stage !== "decide" && (
            <input type="hidden" name="stage" value={stage} />
          )}
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
          {origins.length > 0 && (
            <label className="flex items-center gap-2 text-[15px]">
              <span className="text-muted-foreground">{t("originFilter")}</span>
              <select
                name="origin"
                defaultValue={origin ?? ""}
                className="h-11 rounded-md border border-border-strong bg-background px-3 text-[15px]"
              >
                <option value="">{t("originAll")}</option>
                {origins.map((o) => (
                  <option key={o} value={o}>
                    {t(`origin.${o}`)} {list.origins[o] ?? 0}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button
            type="submit"
            className="h-11 rounded-md border border-border-strong px-4 text-[15px]"
          >
            {t("apply")}
          </button>
        </form>
      </div>

      {list.items.length === 0 ? (
        <EmptyState
          icon={q || origin ? SearchX : Sparkles}
          title={q || origin ? t("noMatchTitle") : t(`stageEmpty.${stage}`)}
          body={q || origin ? t("noMatchBody") : t("stageEmptyBody")}
        />
      ) : (
        <ul className="divide-y divide-border border-y border-border">
          {list.items.map((w) =>
            w.ratio == null && !w.verdict ? (
              <li
                key={w.id}
                data-testid="new-word-row"
                className="flex flex-wrap items-center gap-x-4 gap-y-1 py-4"
              >
                <Link
                  href={`/discover/${w.id}`}
                  className="font-semibold break-words hover:underline hover:underline-offset-4"
                >
                  {w.phrase}
                </Link>
                <WordTags word={w} />
                <span className="text-[13px] text-muted-foreground">
                  {[
                    w.roots.length > 0 &&
                      t("fromSources", {
                        sources: [
                          ...new Set(
                            w.roots.map((r) => {
                              const m = rootMessage(r.root);
                              return t(m.key, m.values);
                            }),
                          ),
                        ]
                          .slice(0, 3)
                          .join("、"),
                      }),
                    w.releasedOn &&
                      t("released", { date: monthDay(w.releasedOn) }),
                    t("found", { date: monthDay(w.firstSeenAt) }),
                    w.priority != null && t("priority", { n: w.priority }),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                <span className="ml-auto">
                  <HideWord id={w.id} hidden={w.hidden} phrase={w.phrase} />
                </span>
              </li>
            ) : (
              <li
                key={w.id}
                data-testid="new-word-row"
                className="relative flex flex-col gap-4 py-6 lg:flex-row lg:items-center"
              >
                <div className="min-w-0 flex-1 space-y-2 pr-10 lg:pr-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/discover/${w.id}`}
                      className="text-lg font-semibold break-words hover:underline hover:underline-offset-4"
                    >
                      {w.phrase}
                    </Link>
                    <WordTags word={w} />
                  </div>
                  <p className="text-[13px] text-muted-foreground">
                    {[
                      w.firstDay &&
                        t("appeared", { date: monthDay(w.firstDay) }),
                      w.burstDay && t("burst", { date: monthDay(w.burstDay) }),
                      `${t("found", { date: monthDay(w.firstSeenAt) })}${(() => {
                        const lag = discoveryLag(w.firstSeenAt, w.burstDay);
                        if (lag === null) return "";
                        const m = lagMessage(lag);
                        return `（${t(`lagShort.${m.key}`, { days: m.days })}）`;
                      })()}`,
                      w.fromZero
                        ? t("fromZero")
                        : w.growth7 != null &&
                          t("growth", { pct: growthPct(w.growth7) }),
                      w.spike && t("spike"),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {w.about && <p className="text-[15px]">{w.about}</p>}
                  {w.origin?.summary && (
                    <p className="text-[13px] text-muted-foreground">
                      {t("originLine", { summary: w.origin.summary })}
                    </p>
                  )}
                  <VerdictLine word={w}>
                    <VerdictReasons reasons={w.reasons} as="sentence" />
                  </VerdictLine>
                </div>
                <dl className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-2 text-[13px] lg:grid lg:w-[520px] lg:grid-cols-4">
                  <div>
                    <dt className="sr-only">{t("heat")}</dt>
                    <dd className="whitespace-nowrap">
                      <span className="text-muted-foreground">GPTs </span>
                      <span className="font-mono font-semibold tabular-nums">
                        {times(w.ratio)}
                      </span>
                    </dd>
                  </div>
                  <div>
                    <dt className="sr-only">{t("curve")}</dt>
                    <dd>
                      <Sparkline
                        values={w.curve.slice(-7).map((d) => d.value)}
                      />
                    </dd>
                  </div>
                  <div className="whitespace-nowrap">
                    <dt className="inline text-muted-foreground">
                      {t("innerCandidates")}{" "}
                    </dt>
                    <dd className="inline font-mono font-semibold tabular-nums">
                      {w.innerCandidates}
                    </dd>
                  </div>
                  <div className="whitespace-nowrap">
                    <dt className="inline text-muted-foreground">
                      {t("dedicated")}{" "}
                    </dt>
                    <dd className="inline font-mono font-semibold tabular-nums">
                      {w.dedicatedPages ?? "—"}
                    </dd>
                  </div>
                </dl>
                <div className="absolute top-5 right-0 lg:static">
                  <HideWord id={w.id} hidden={w.hidden} phrase={w.phrase} />
                </div>
              </li>
            ),
          )}
        </ul>
      )}
      {pages > 1 && (
        <nav
          aria-label={t("pages")}
          className="flex items-center gap-4 text-[15px]"
        >
          {page > 1 && (
            <Link href={href({ stage, page: page - 1 })}>{t("prev")}</Link>
          )}
          <span className="text-muted-foreground">
            {t("pageOf", { page, pages })}
          </span>
          {page < pages && (
            <Link href={href({ stage, page: page + 1 })}>{t("next")}</Link>
          )}
        </nav>
      )}
    </main>
  );
}
