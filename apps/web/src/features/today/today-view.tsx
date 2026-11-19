import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";

import type { NewWordDto } from "@repo/research/new-word-dto";
import type { PoolKeywordDto, PoolRoundDto } from "@repo/research/pool-dto";

import { TrackView } from "@/components/analytics/track";
import { LocalDateTime } from "@/components/local-date-time";
import { VerdictLine, WordTags } from "@/features/new-words/new-word-badges";
import { times } from "@/features/new-words/new-word-format";
import { PoolStatusBadge, RoundStatusBadge } from "@/features/pool/pool-badges";
import { count, usd } from "@/features/pool/pool-format";
import { SiteState } from "@/features/sites/site-state";
import { apiGet } from "@/server/api/api";

type Today = {
  newWords: NewWordDto[];
  newWordCounts: Partial<Record<"worth" | "try", number>>;
  candidates: PoolKeywordDto[];
  waiting: number;
  evergreenRound: PoolRoundDto | null;
  newWordsRound: PoolRoundDto | null;
  spend: {
    bucket: "research" | "evergreen" | "new_words" | "platform";
    kind: "data" | "ai";
    micros: number;
  }[];
  worker: {
    lastSeenAt: string;
    online: boolean;
    schedule: {
      newWordsScanHours: number | null;
      newWordsDaily: boolean;
      evergreenEveryDays: number | null;
    } | null;
  } | null;
  sites: {
    total: number;
    down: {
      domain: string;
      name: string;
      since: string | null;
      lastStatus: number | null;
    }[];
    syncedAt: string | null;
  };
  heartbeats: { source: string; state: "up" | "down"; reason: string }[];
  domainsExpiring: { domain: string; expiresAt: string; daysLeft: number }[];
  expenses: { currency: string; amountMinor: number }[];
  reviews: {
    id: string;
    phrase: string;
    status: PoolKeywordDto["status"];
    reviewAt: string;
    due: boolean;
  }[];
};

const card = "space-y-4 rounded-lg border border-border bg-card p-6";

// What needs the maintainer today: new words, keywords to decide, sites that are down,
// keywords to look at again, rounds, money.
export async function TodayView() {
  const t = await getTranslations("today");
  const format = await getFormatter();
  const d = await apiGet<Today>("/api/today");
  const spent = (bucket: Today["spend"][number]["bucket"]) =>
    d.spend
      .filter((s) => s.bucket === bucket)
      .reduce((a, s) => a + s.micros, 0);
  const total = d.spend.reduce((a, s) => a + s.micros, 0);
  const sched = d.worker?.schedule ?? null;

  return (
    <main className="mx-auto w-full max-w-310 space-y-8 px-5 py-8 md:py-16">
      <TrackView event="dashboard_viewed" />
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <h1 className="font-heading text-[28px] font-semibold tracking-tight md:text-4xl">
            {t("title")}
          </h1>
          <p className="text-[15px] text-muted-foreground">{t("subtitle")}</p>
        </div>
        <p
          className="text-[13px] text-muted-foreground"
          data-testid="worker-status"
        >
          {d.worker
            ? d.worker.online
              ? t("workerOnline")
              : t("workerOffline", {
                  at: new Date(d.worker.lastSeenAt)
                    .toISOString()
                    .slice(0, 16)
                    .replace("T", " "),
                })
            : t("workerNever")}
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="today-words" className={card}>
          <div className="flex items-baseline justify-between gap-4">
            <h2 id="today-words" className="font-heading text-xl font-semibold">
              {t("wordsTitle")}
            </h2>
            <Link
              href="/discover"
              className="text-[13px] text-muted-foreground hover:underline"
            >
              {t("wordsAll")}
            </Link>
          </div>
          <p className="text-[13px] text-muted-foreground">
            {t("wordsCounts", {
              worth: d.newWordCounts.worth ?? 0,
              try: d.newWordCounts.try ?? 0,
            })}
          </p>
          {d.newWords.length === 0 ? (
            <p className="text-[15px] text-muted-foreground">
              {t("wordsEmpty")}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {d.newWords.map((w) => (
                <li key={w.id} className="space-y-1 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/discover/${w.id}`}
                      className="font-semibold hover:underline"
                    >
                      {w.phrase}
                    </Link>
                    <WordTags word={w} />
                    <span className="font-mono text-[13px] tabular-nums sm:ml-auto">
                      GPTs {times(w.ratio)}
                    </span>
                  </div>
                  <VerdictLine word={w} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="today-keywords" className={card}>
          <div className="flex items-baseline justify-between gap-4">
            <h2
              id="today-keywords"
              className="font-heading text-xl font-semibold"
            >
              {t("keywordsTitle")}
            </h2>
            <Link
              href="/keywords"
              className="text-[13px] text-muted-foreground hover:underline"
            >
              {t("keywordsAll", { n: d.waiting })}
            </Link>
          </div>
          {d.candidates.length === 0 ? (
            <p className="text-[15px] text-muted-foreground">
              {t("keywordsEmpty")}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {d.candidates.map((k) => (
                <li
                  key={k.id}
                  className="flex flex-wrap items-center gap-3 py-3"
                >
                  <Link
                    href={`/keywords/${k.id}`}
                    className="font-semibold hover:underline"
                  >
                    {k.phrase}
                  </Link>
                  <PoolStatusBadge status={k.status} />
                  <span className="font-mono text-[13px] text-muted-foreground tabular-nums sm:ml-auto">
                    {t("keywordFacts", {
                      volume: count(k.searchVolume),
                      kd: k.keywordDifficulty ?? "—",
                      strong: k.strongCompetitors ?? "—",
                    })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="today-sites" className={card}>
          <div className="flex items-baseline justify-between gap-4">
            <h2 id="today-sites" className="font-heading text-xl font-semibold">
              {t("sitesTitle")}
            </h2>
            <Link
              href="/sites"
              className="text-[13px] text-muted-foreground hover:underline"
            >
              {t("sitesAll", { n: d.sites.total })}
            </Link>
          </div>
          {d.sites.syncedAt === null ? (
            <p className="text-[15px] text-muted-foreground">
              {t("sitesNever")}
            </p>
          ) : d.sites.down.length === 0 ? (
            <p className="text-[15px]" data-testid="today-sites-ok">
              {t("sitesAllUp", { n: d.sites.total })}
            </p>
          ) : (
            <ul className="divide-y divide-border" data-testid="today-down">
              {d.sites.down.map((s) => (
                <li
                  key={s.domain}
                  className="flex flex-wrap items-center gap-3 py-3"
                >
                  <Link
                    href={`/sites/${encodeURIComponent(s.domain)}`}
                    className="font-semibold hover:underline"
                  >
                    {s.name}
                  </Link>
                  <SiteState state="down" />
                  {s.since && (
                    <span className="text-[13px] text-muted-foreground sm:ml-auto">
                      {t("downSince")} <LocalDateTime iso={s.since} />
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
          <ul className="space-y-1 text-[13px] text-muted-foreground">
            {d.heartbeats.map((h) => (
              <li key={h.source} data-testid="today-heartbeat">
                {h.state === "up"
                  ? t("heartbeatUp", { source: h.source })
                  : t("heartbeatDown", { source: h.source, reason: h.reason })}
              </li>
            ))}
            {d.domainsExpiring.map((x) => (
              <li
                key={x.domain}
                className="font-medium text-destructive"
                data-testid="today-domain"
              >
                {t("domainExpiring", {
                  domain: x.domain,
                  day: x.expiresAt.slice(0, 10),
                  days: x.daysLeft,
                })}
              </li>
            ))}
            {d.sites.syncedAt && (
              <li>
                {t("sitesSynced")} <LocalDateTime iso={d.sites.syncedAt} />
              </li>
            )}
          </ul>
        </section>

        <section aria-labelledby="today-reviews" className={card}>
          <h2 id="today-reviews" className="font-heading text-xl font-semibold">
            {t("reviewsTitle")}
          </h2>
          {d.reviews.length === 0 ? (
            <p className="text-[15px] text-muted-foreground">
              {t("reviewsEmpty")}
            </p>
          ) : (
            <ul className="divide-y divide-border" data-testid="today-reviews">
              {d.reviews.map((k) => (
                <li
                  key={k.id}
                  className="flex flex-wrap items-center gap-3 py-3"
                >
                  <Link
                    href={`/keywords/${k.id}`}
                    className="font-semibold hover:underline"
                  >
                    {k.phrase}
                  </Link>
                  <PoolStatusBadge status={k.status} />
                  <span className="text-[13px] text-muted-foreground tabular-nums sm:ml-auto">
                    {t(k.due ? "reviewDue" : "reviewOn", {
                      day: k.reviewAt.slice(0, 10),
                    })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section
        aria-labelledby="today-status"
        className="space-y-3 border-t border-border pt-6 text-[13px] text-muted-foreground"
      >
        <h2 id="today-status" className="sr-only">
          {t("statusTitle")}
        </h2>
        <ul className="flex flex-col gap-2 md:flex-row md:flex-wrap md:gap-x-8">
          {(
            [
              [
                "newWords",
                d.newWordsRound,
                !sched
                  ? t("newWordsSchedule")
                  : !sched.newWordsDaily
                    ? t("scheduleOff")
                    : sched.newWordsScanHours
                      ? t("newWordsScanSchedule", {
                          hours: sched.newWordsScanHours,
                        })
                      : t("newWordsSchedule"),
              ],
              [
                "evergreen",
                d.evergreenRound,
                !sched
                  ? t("evergreenSchedule")
                  : sched.evergreenEveryDays === null
                    ? t("scheduleOff")
                    : sched.evergreenEveryDays === 1
                      ? t("evergreenDaily")
                      : t("evergreenEveryDays", {
                          days: sched.evergreenEveryDays,
                        }),
              ],
            ] as const
          ).map(([key, round, schedule]) => (
            <li key={key} className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-foreground">
                {t(`round.${key}`)}
              </span>
              {round ? (
                <>
                  <RoundStatusBadge status={round.status} />
                  <Link
                    href={`/keywords/rounds/${round.id}`}
                    className="hover:underline"
                  >
                    <LocalDateTime iso={round.createdAt} />
                  </Link>
                </>
              ) : (
                <span>{t("roundNone")}</span>
              )}
              <span>· {schedule}</span>
            </li>
          ))}
        </ul>
        <p data-testid="today-spend">
          {t("spendLine", {
            total: usd(total),
            newWords: usd(spent("new_words")),
            evergreen: usd(spent("evergreen")),
            platform: usd(spent("platform")),
            research: usd(spent("research")),
          })}{" "}
          <Link
            href="/settings/providers"
            className="underline underline-offset-4"
          >
            {t("spendLink")}
          </Link>
        </p>
        <p data-testid="today-expenses">
          {t("expensesLine", {
            total: d.expenses.length
              ? d.expenses
                  .map((x) =>
                    format.number(x.amountMinor / 100, {
                      style: "currency",
                      currency: x.currency,
                    }),
                  )
                  .join(" + ")
              : usd(0),
          })}{" "}
          <Link
            href="/settings/expenses"
            className="underline underline-offset-4"
          >
            {t("expensesLink")}
          </Link>
        </p>
      </section>
    </main>
  );
}
