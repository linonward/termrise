import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { Tag } from "@repo/ui/components/badge";

import { LocalDateTime } from "@/components/local-date-time";
import { DiscoverHeader } from "@/features/discover/discover-header";
import { TabIntro } from "@/features/discover/filter-chips";
import {
  AddWatch,
  RemoveWatch,
  SwitchRole,
} from "@/features/site-watch/watch-actions";
import { apiGet } from "@/server/api/api";

type Source = {
  id: string;
  prefix: string;
  role: "signal" | "confirm";
  method: "feed" | "sitemap" | "links" | null;
  lastCheckedAt: string | null;
  lastError: string | null;
  pagesKnown: number;
};
type Page = {
  id: string;
  sourceId: string;
  url: string;
  title: string | null;
  phrase: string | null;
  publishedAt: string | null;
  firstSeenAt: string;
  newWordId: string | null;
  alsoOn: string[];
};

export async function generateMetadata() {
  return { title: (await getTranslations("discover"))("watchMetaTitle") };
}

const short = (u: string) => u.replace(/^https?:\/\/(www\.)?/, "");

// Sections of other sites whose new pages become new words (docs/product/keyword-pool.md#site-watch).
export default async function WatchPage() {
  const t = await getTranslations("discover");
  const { sources, pages } = await apiGet<{
    sources: Source[];
    pages: Page[];
  }>("/api/pool/watch");
  const prefixOf = new Map(sources.map((s) => [s.id, short(s.prefix)]));
  // Signals first, then cross-checks; each by address.
  const ordered = [...sources].sort(
    (a, b) =>
      Number(a.role === "confirm") - Number(b.role === "confirm") ||
      a.prefix.localeCompare(b.prefix),
  );
  return (
    <main className="mx-auto w-full max-w-310 space-y-8 px-5 py-8 md:py-16">
      <DiscoverHeader current="watch">
        <TabIntro intro={t("watchIntro")} />
      </DiscoverHeader>

      <section aria-labelledby="watch-sources" className="space-y-4">
        <h2 id="watch-sources" className="font-heading text-xl font-semibold">
          {t("watchSourcesTitle")}
        </h2>
        <AddWatch />
        {sources.length === 0 ? (
          <p className="text-[15px] text-muted-foreground">{t("watchEmpty")}</p>
        ) : (
          <ul className="divide-y divide-border border-y border-border">
            {ordered.map((s) => (
              <li
                key={s.id}
                data-testid="watch-source"
                className="flex flex-wrap items-center gap-3 py-3"
              >
                <a
                  href={s.prefix}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium break-all hover:underline"
                >
                  {short(s.prefix)}
                </a>
                <Tag>{t(`watchRole.${s.role}`)}</Tag>
                <Tag>{t(`watchMethod.${s.method ?? "pending"}`)}</Tag>
                <span className="text-[13px] text-muted-foreground tabular-nums">
                  {t("watchPagesKnown", { n: s.pagesKnown })}
                </span>
                {s.lastCheckedAt && (
                  <span className="text-[13px] text-muted-foreground">
                    {t("watchChecked")} <LocalDateTime iso={s.lastCheckedAt} />
                  </span>
                )}
                {s.lastError && (
                  <span className="text-[13px] text-destructive">
                    {t("watchError", { error: s.lastError })}
                  </span>
                )}
                <span className="flex gap-2 sm:ml-auto">
                  <SwitchRole id={s.id} role={s.role} />
                  <RemoveWatch id={s.id} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="watch-pages" className="space-y-4">
        <h2 id="watch-pages" className="font-heading text-xl font-semibold">
          {t("watchPagesTitle")}
        </h2>
        {pages.length === 0 ? (
          <p className="text-[15px] text-muted-foreground">
            {t("watchPagesEmpty")}
          </p>
        ) : (
          <ul className="divide-y divide-border border-y border-border">
            {pages.map((p) => (
              <li
                key={p.id}
                data-testid="watch-page"
                className="space-y-1 py-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  {p.phrase ? (
                    <span className="font-semibold">{p.phrase}</span>
                  ) : (
                    <span className="text-muted-foreground">
                      {t("watchNoPhrase")}
                    </span>
                  )}
                  {p.newWordId && (
                    <Link
                      href={`/discover/${p.newWordId}`}
                      className="text-[13px] underline underline-offset-4"
                    >
                      {t("watchNewWord")}
                    </Link>
                  )}
                  {p.alsoOn.length > 0 && (
                    <Tag>
                      {t("watchAlsoOn", { sites: p.alsoOn.join("、") })}
                    </Tag>
                  )}
                  <span className="text-[13px] text-muted-foreground sm:ml-auto">
                    <LocalDateTime iso={p.publishedAt ?? p.firstSeenAt} />
                  </span>
                </div>
                <p className="text-[13px] break-all text-muted-foreground">
                  {prefixOf.get(p.sourceId)} ·{" "}
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noreferrer"
                    className="hover:underline"
                  >
                    {p.title ?? short(p.url)}
                  </a>
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
