import { getTranslations } from "next-intl/server";

import type { NewWordDto } from "@repo/research/new-word-dto";
import { Tag } from "@repo/ui/components/badge";

import { count } from "@/features/pool/pool-format";

// Why the word rose and how to meet the demand, with the evidence found around its burst
// (docs/product/keyword-pool.md#origins).
export async function WordOrigin({ word }: { word: NewWordDto }) {
  const t = await getTranslations("newWords");
  const o = word.origin;
  const evidence = o
    ? [...o.evidence].sort(
        (a, b) =>
          Number(b.first) - Number(a.first) ||
          Number(b.cited) - Number(a.cited) ||
          Number(!a.at) - Number(!b.at) ||
          a.at.localeCompare(b.at),
      )
    : [];
  return (
    <section
      aria-labelledby="origin"
      className="space-y-4 rounded-lg border border-border bg-card p-6 md:p-8"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="origin" className="font-heading text-xl font-semibold">
          {t("originTitle")}
        </h2>
        {o?.type && <Tag tone="brand">{t(`origin.${o.type}`)}</Tag>}
      </div>
      {!o ? (
        <p className="text-[15px] text-muted-foreground">
          {word.verdict === "skip" ? t("originSkip") : t("originPending")}
        </p>
      ) : (
        <>
          <dl className="grid gap-6 md:grid-cols-2">
            <div className="space-y-1">
              <dt className="text-[13px] text-muted-foreground">
                {t("originWhy")}
              </dt>
              <dd className="text-[15px]">{o.summary}</dd>
            </div>
            <div className="space-y-1">
              <dt className="text-[13px] text-muted-foreground">
                {t("originCapture")}
              </dt>
              <dd className="text-[15px]">{o.capture}</dd>
            </div>
          </dl>
          <div className="space-y-2 border-t border-border pt-4">
            <h3 className="text-[13px] text-muted-foreground">
              {t("originEvidence", { n: evidence.length })}
            </h3>
            {evidence.length === 0 ? (
              <p className="text-[15px] text-muted-foreground">
                {t("originNone")}
              </p>
            ) : (
              <ul className="space-y-2">
                {evidence.map((e) => (
                  <li
                    key={e.url + e.title}
                    data-testid="origin-evidence"
                    className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[15px]"
                  >
                    <span className="font-mono text-[13px] text-muted-foreground tabular-nums">
                      {e.at.slice(0, 10)}
                    </span>
                    <Tag>{t(`originSource.${e.source}`)}</Tag>
                    {e.first && <Tag tone="brand">{t("originFirst")}</Tag>}
                    {!e.first && e.cited && <Tag>{t("originCited")}</Tag>}
                    {e.kind === "summary" ? (
                      <span>
                        <span className="text-muted-foreground">
                          {t("originAnswer")}：
                        </span>
                        {e.title}
                      </span>
                    ) : (
                      <a
                        href={e.url}
                        target="_blank"
                        rel="noreferrer nofollow"
                        className="break-all hover:underline hover:underline-offset-4"
                      >
                        {e.title}
                      </a>
                    )}
                    {e.score != null && (
                      <span className="font-mono text-[13px] text-muted-foreground tabular-nums">
                        {t(`originScore.${e.kind}`, { n: count(e.score) })}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <p className="text-[13px] text-muted-foreground">
              {t("originChecked", { date: o.checkedAt.slice(0, 10) })}
            </p>
          </div>
        </>
      )}
    </section>
  );
}
