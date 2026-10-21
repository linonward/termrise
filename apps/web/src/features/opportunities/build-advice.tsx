import { getFormatter, getTranslations } from "next-intl/server";

import {
  NEW_SITE_MAX_DEDICATED,
  NEW_SITE_MAX_KD,
  NEW_SITE_MIN_VOLUME,
  MIN_VOLUME,
} from "@repo/research/build-advice";
import type { OpportunityDetailDto } from "@repo/research/research-dto";

import { StatusBadge } from "@/components/status-badge";
import { buildAdviceBadge } from "@/lib/status-badges";

type Advice = NonNullable<OpportunityDetailDto["buildAdvice"]>["advice"];

/** The build advice as a badge: new site, inner page, weak demand or unknown. */
export async function BuildAdviceBadge({ advice }: { advice: Advice }) {
  const t = await getTranslations("opportunities.build.advice");
  return (
    <StatusBadge badge={buildAdviceBadge(advice)} data-testid="build-advice">
      {t(advice)}
    </StatusBadge>
  );
}

// What to build and why, with the numbers each reason rests on
// (docs/product/ux.md#opportunities).
export async function BuildAdvicePanel({ o }: { o: OpportunityDetailDto }) {
  const t = await getTranslations("opportunities.build");
  const format = await getFormatter();
  if (!o.buildAdvice)
    return (
      <p className="text-[15px] text-muted-foreground">{t("notEvaluated")}</p>
    );
  const strongest = [...o.keywords]
    .filter((k) => k.searchVolume !== null)
    .sort((a, b) => b.searchVolume! - a.searchVolume!)[0];
  const serp = o.serpCompetition;
  const values = {
    volume: format.number(strongest?.searchVolume ?? 0),
    kd: strongest?.keywordDifficulty ?? 0,
    dedicated: serp?.dedicatedPages ?? 0,
    minVolume: format.number(MIN_VOLUME),
    siteVolume: format.number(NEW_SITE_MIN_VOLUME),
    maxKd: NEW_SITE_MAX_KD,
    maxDedicated: NEW_SITE_MAX_DEDICATED,
  };
  return (
    <div className="space-y-3" data-testid="build-advice-panel">
      <BuildAdviceBadge advice={o.buildAdvice.advice as Advice} />
      <ul className="list-disc space-y-1 pl-5 text-[15px]">
        {o.buildAdvice.reasons.map((reason) => (
          <li key={reason}>{t(`reason.${reason as "volume_high"}`, values)}</li>
        ))}
      </ul>
      {serp && (
        <p
          className="text-[13px] text-muted-foreground"
          data-testid="serp-competition"
        >
          {t("serp", {
            phrase: serp.phrase,
            results: serp.results,
            homepages: serp.homepages,
            innerPages: serp.innerPages,
            dedicated: serp.dedicatedPages,
          })}
        </p>
      )}
      <p className="text-[13px] text-muted-foreground">
        {t("note", { version: o.buildAdvice.version })}
      </p>
    </div>
  );
}
