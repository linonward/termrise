import { Sparkles } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import type { NewWordDto } from "@repo/research/new-word-dto";
import type { PoolRoundDto } from "@repo/research/pool-dto";
import { cn } from "@repo/ui/utils";

import { EmptyState } from "@/components/empty-state";
import { HideWord } from "@/features/new-words/hide-word";
import {
  VerdictLine,
  VerdictReasons,
  WordTags,
} from "@/features/new-words/new-word-badges";
import {
  daysSince,
  monthDay,
  times,
} from "@/features/new-words/new-word-format";
import { Sparkline } from "@/features/new-words/sparkline";
import { StartNewWords } from "@/features/new-words/start-new-words";
import { apiGet } from "@/server/api/api";

const VERDICTS = ["worth", "try", "skip"] as const;

export async function generateMetadata() {
  return { title: (await getTranslations("newWords"))("metaTitle") };
}

// New words: queries just rising on Google (docs/product/keyword-pool.md#new-words).
export default async function NewWordsPage({
  searchParams,
}: PageProps<"/discover">) {
  const params = await searchParams;
  const verdict = VERDICTS.find((v) => v === params.verdict);
  const hidden = params.hidden === "1";
  const t = await getTranslations("newWords");
  const query = new URLSearchParams({
    ...(verdict ? { verdict } : {}),
    ...(hidden ? { hidden: "1" } : {}),
  });
  const [list, rounds] = await Promise.all([
    apiGet<{ items: NewWordDto[]; total: number }>(
      `/api/pool/new-words?${query}`,
    ),
    apiGet<{ items: PoolRoundDto[] }>("/api/pool/rounds"),
  ]);
  const open = rounds.items.some(
    (r) =>
      r.kind === "new_words" &&
      (r.status === "queued" || r.status === "running"),
  );
  const filter = (
    key: string | undefined,
    label: string,
    active: boolean,
    extra = "",
  ) => (
    <Link
      key={label}
      href={`/discover?${new URLSearchParams({ ...(key ? { verdict: key } : {}), ...(extra ? { hidden: "1" } : {}) })}`}
      aria-current={active ? "page" : undefined}
      className={cn(
        "rounded-full border border-border px-3 py-1 text-[13px]",
        active && "border-primary bg-primary text-primary-foreground",
      )}
    >
      {label}
    </Link>
  );

  return (
    <main className="mx-auto w-full max-w-310 space-y-8 px-5 py-8 md:py-16">
      <header className="space-y-2">
        <h1 className="font-heading text-[28px] font-semibold tracking-tight md:text-4xl">
          {t("title")}
        </h1>
        <p className="text-[15px] text-muted-foreground">{t("subtitle")}</p>
      </header>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <nav aria-label={t("filter")} className="flex flex-wrap gap-2">
          {filter(undefined, t("all"), !verdict && !hidden)}
          {VERDICTS.map((v) =>
            filter(v, t(`verdict.${v}`), verdict === v && !hidden),
          )}
          {filter(undefined, t("hidden"), hidden, "1")}
        </nav>
        <StartNewWords open={open} />
      </div>
      {list.items.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title={t("emptyTitle")}
          body={t("emptyBody")}
        />
      ) : (
        <ul className="divide-y divide-border border-y border-border">
          {list.items.map((w) => (
            <li
              key={w.id}
              data-testid="new-word-row"
              className="flex flex-col gap-4 py-6 lg:flex-row lg:items-center"
            >
              <div className="min-w-0 flex-1 space-y-2">
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
                  {t("seen", {
                    date: monthDay(w.firstSeenAt),
                    days: daysSince(w.firstSeenAt),
                  })}
                  {w.burstDay &&
                    ` · ${t("burst", { date: monthDay(w.burstDay) })}`}
                  {w.fromZero && ` · ${t("fromZero")}`}
                </p>
                {w.about && <p className="text-[15px]">{w.about}</p>}
                <VerdictLine word={w}>
                  <VerdictReasons reasons={w.reasons} as="sentence" />
                </VerdictLine>
              </div>
              <dl className="grid shrink-0 grid-cols-2 items-center gap-x-6 gap-y-2 text-[13px] sm:grid-cols-4 lg:w-[520px]">
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
                    <Sparkline values={w.curve.slice(-7).map((d) => d.value)} />
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
              <HideWord id={w.id} hidden={w.hidden} phrase={w.phrase} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
