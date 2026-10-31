import { ChevronRight, House } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import type { NewWordDto } from "@repo/research/new-word-dto";
import { Tag } from "@repo/ui/components/badge";

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
  times,
} from "@/features/new-words/new-word-format";
import { SelectWord } from "@/features/new-words/select-word";
import { TrendChart } from "@/features/new-words/sparkline";
import { WordOrigin } from "@/features/new-words/word-origin";
import { count, displayUrl, usd } from "@/features/pool/pool-format";
import { apiGet } from "@/server/api/api";

type Detail = NewWordDto & { children: NewWordDto[] };

export async function generateMetadata({
  params,
}: PageProps<"/discover/[id]">) {
  const { id } = await params;
  const w = await apiGet<Detail>(`/api/pool/new-words/${id}`).catch(() => null);
  return {
    title: w?.phrase ?? (await getTranslations("newWords"))("metaTitle"),
  };
}

const card = "rounded-lg border border-border bg-card p-6 md:p-8";

// One new word, laid out like the maintainer's reference screens.
export default async function NewWordPage({
  params,
}: PageProps<"/discover/[id]">) {
  const { id } = await params;
  const t = await getTranslations("newWords");
  const w = await apiGet<Detail>(`/api/pool/new-words/${id}`);
  const dedicated = (w.serp ?? []).filter((r) => {
    const words = w.phrase.split(" ");
    const text = `${r.title} ${decodeURIComponent(r.url)}`.toLowerCase();
    return words.every((x) => text.includes(x));
  });
  const lag = discoveryLag(w.firstSeenAt, w.burstDay);
  const lagText =
    lag === null
      ? null
      : t(`lagFull.${lagMessage(lag).key}`, { days: lagMessage(lag).days });
  const facts: [string, string, string | null][] = [
    [
      t("heatFull"),
      times(w.ratio),
      w.ratioDay ? t("measuredOn", { date: w.ratioDay }) : null,
    ],
    [t("firstDay"), w.firstDay ?? "—", null],
    [t("burstDay"), w.burstDay ?? "—", null],
    [t("firstSeen"), w.firstSeenAt.slice(0, 10), lagText],
    [t("peakDay"), w.peakDay ?? "—", null],
    [
      t("last7"),
      w.fromZero
        ? t("fromZeroShort")
        : w.growth7 != null
          ? growthPct(w.growth7)
          : w.rising
            ? t("risingShort")
            : t("flatShort"),
      w.spike ? t("spike") : w.rising ? t("risingShort") : t("flatShort"),
    ],
    [t("innerCandidates"), t("count", { n: w.innerCandidates }), null],
  ];
  const trendsUrl = `https://trends.google.com/trends/explore?date=today%203-m&geo=US&q=${encodeURIComponent(w.phrase)},gpts`;

  return (
    <main className="mx-auto w-full max-w-310 space-y-10 px-5 py-8 md:py-12">
      <nav
        aria-label={t("breadcrumb")}
        className="flex items-center gap-2 text-[13px] text-muted-foreground"
      >
        <House aria-hidden="true" className="size-4" />
        <Link href="/today" className="hover:underline">
          {t("home")}
        </Link>
        <ChevronRight aria-hidden="true" className="size-3.5" />
        <Link href="/discover" className="hover:underline">
          {t("title")}
        </Link>
        <ChevronRight aria-hidden="true" className="size-3.5" />
        <span className="text-foreground">{w.phrase}</span>
      </nav>

      <section className={`${card} space-y-8`}>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-heading text-[28px] font-semibold tracking-tight break-words md:text-4xl">
            {w.phrase}
          </h1>
          <WordTags word={w} />
          <span className="ml-auto">
            <HideWord id={w.id} hidden={w.hidden} phrase={w.phrase} />
          </span>
        </div>
        <dl className="grid grid-cols-2 gap-6 md:grid-cols-6">
          {facts.map(([label, value, note]) => (
            <div key={label} className="space-y-1">
              <dt className="text-[13px] text-muted-foreground">{label}</dt>
              <dd className="font-mono text-xl font-semibold tabular-nums">
                {value}
              </dd>
              {note && (
                <dd className="text-[13px] text-muted-foreground">{note}</dd>
              )}
            </div>
          ))}
        </dl>
        {w.curve.length > 1 && (
          <div className="space-y-2">
            <TrendChart
              days={w.curve}
              label={t("chartLabel", { phrase: w.phrase })}
            />
            <div className="flex justify-between font-mono text-[13px] text-muted-foreground">
              <span>{w.curve[0].day}</span>
              {w.peakDay && <span>{t("peakOn", { date: w.peakDay })}</span>}
              <span>{w.curve.at(-1)!.day}</span>
            </div>
          </div>
        )}
        <p className="flex flex-wrap gap-x-6 gap-y-1 text-[13px] text-muted-foreground">
          <a
            href={trendsUrl}
            target="_blank"
            rel="noreferrer"
            className="text-brand hover:underline"
          >
            {t("openTrends")}
          </a>
          {w.checkedAt && (
            <span>{t("checkedOn", { date: w.checkedAt.slice(0, 10) })}</span>
          )}
          <span>
            {t("seenRange", {
              first: w.firstSeenAt.slice(0, 10),
              last: w.lastSeenAt.slice(0, 10),
            })}
          </span>
        </p>
        {w.isNew && w.preBurstShare != null && (
          <p className="text-[13px] text-muted-foreground">{t("newNote")}</p>
        )}
        {(w.about || w.userWants || w.plan) && (
          <dl className="grid gap-6 border-t border-border pt-6 md:grid-cols-3">
            {(
              [
                ["about", w.about],
                ["userWants", w.userWants],
                ["plan", w.plan],
              ] as const
            ).map(([key, text]) => (
              <div key={key} className="space-y-1">
                <dt className="text-[13px] text-muted-foreground">
                  {t(`ai.${key}`)}
                </dt>
                <dd className="text-[15px]">{text ?? "—"}</dd>
              </div>
            ))}
          </dl>
        )}
        <div className="space-y-3 border-t border-border pt-6">
          <VerdictLine word={w} />
          <VerdictReasons reasons={w.reasons} as="list" />
          {w.selectedAt ? (
            <p className="text-[15px] font-medium">
              {t("selected", { date: w.selectedAt.slice(0, 10) })}
            </p>
          ) : (
            w.verdict !== "skip" && <SelectWord id={w.id} />
          )}
        </div>
      </section>

      <WordOrigin word={w} />

      <section aria-labelledby="tails" className="space-y-3">
        <h2 id="tails" className="font-heading text-xl font-semibold">
          {t("tailsTitle")}{" "}
          <span className="text-[13px] font-normal text-muted-foreground">
            {t("tailsBody")}
          </span>
        </h2>
        <div className={card}>
          {w.children.length === 0 ? (
            <div className="space-y-1 py-6 text-center">
              <p className="font-semibold">{t("tailsEmpty")}</p>
              <p className="text-[13px] text-muted-foreground">
                {t("tailsEmptyBody")}
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {w.children.map((c) => (
                <li
                  key={c.id}
                  className="flex flex-wrap items-center gap-3 py-3"
                >
                  <Link
                    href={`/discover/${c.id}`}
                    className="font-medium hover:underline"
                  >
                    {c.phrase}
                  </Link>
                  <WordTags word={c} />
                  <span className="ml-auto font-mono text-[13px] tabular-nums">
                    GPTs {times(c.ratio)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section aria-labelledby="data" className={`${card} space-y-4`}>
        <h2 id="data" className="text-[13px] text-muted-foreground">
          {t("dataTitle")}
        </h2>
        <dl className="grid grid-cols-2 gap-6 md:grid-cols-3">
          {(
            [
              [t("volume"), count(w.searchVolume)],
              [
                "KD",
                w.keywordDifficulty == null ? "—" : String(w.keywordDifficulty),
              ],
              ["CPC", usd(w.cpcMicros)],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="space-y-1">
              <dt className="text-[13px] text-muted-foreground">{label}</dt>
              <dd className="font-mono text-xl font-semibold tabular-nums">
                {value}
              </dd>
            </div>
          ))}
        </dl>
        <p className="text-[13px] text-muted-foreground">{t("dataNote")}</p>
      </section>

      <section aria-labelledby="dedicated" className="space-y-3">
        <h2 id="dedicated" className="font-heading text-xl font-semibold">
          {t("dedicatedTitle")}{" "}
          <span className="text-[13px] font-normal text-muted-foreground">
            {w.serp
              ? t("dedicatedBody", {
                  n: dedicated.length,
                  total: w.serp.length,
                })
              : t("notChecked")}
          </span>
        </h2>
        <div className={card}>
          {dedicated.length === 0 ? (
            <p className="text-[15px] text-muted-foreground">
              {w.serp ? t("dedicatedNone") : t("notChecked")}
            </p>
          ) : (
            <ol className="divide-y divide-border">
              {dedicated.map((r) => (
                <li key={r.rank} className="flex gap-4 py-3">
                  <span className="w-6 font-mono text-sm text-muted-foreground tabular-nums">
                    {r.rank}
                  </span>
                  <span className="min-w-0 space-y-0.5">
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noreferrer nofollow"
                      className="block truncate font-medium hover:underline"
                    >
                      {r.title}
                    </a>
                    <span className="block font-mono text-[12px] break-all text-muted-foreground">
                      {displayUrl(r.url) ?? t("viaGoogle", { site: r.site })}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>

      <section aria-labelledby="new-sites" className="space-y-3">
        <h2 id="new-sites" className="font-heading text-xl font-semibold">
          {t("newSitesTitle")}
        </h2>
        <div className={card}>
          {w.newSites === null ? (
            <p className="text-[15px] text-muted-foreground">
              {t("notChecked")}
            </p>
          ) : w.newSites.length === 0 ? (
            <p className="text-[15px] text-muted-foreground">
              {t("newSitesNone")}
            </p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {w.newSites.map((s) => (
                <Tag key={s.domain}>
                  {t("newSite", { domain: s.domain, date: s.registeredOn })}
                </Tag>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section aria-labelledby="roots" className="space-y-3">
        <h2 id="roots" className="font-heading text-xl font-semibold">
          {t("rootsTitle")}{" "}
          <span className="text-[13px] font-normal text-muted-foreground">
            {t("rootsBody")}
          </span>
        </h2>
        <div className={card}>
          <ul className="flex flex-wrap gap-2">
            {w.roots.map((r) => (
              <li
                key={r.root}
                className="rounded-md bg-surface-strong px-3 py-1.5 text-[15px]"
              >
                {r.root}
                {r.growth != null && (
                  <span className="text-muted-foreground">
                    {" "}
                    · +{r.growth.toLocaleString("en-US")}%
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      </section>
      {w.rules && (
        <p className="text-[13px] text-muted-foreground">
          {t("rules", { rules: w.rules })}
        </p>
      )}
    </main>
  );
}
