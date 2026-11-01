// Public shapes of new words (docs/architecture/api.md).
import type { newWordRoots } from "@repo/db/schema";

import type { StoredEvidence } from "./new-word-origin";
import type { NewWord } from "./new-words";

type Root = typeof newWordRoots.$inferSelect;

export function toNewWordDto(row: {
  word: NewWord;
  innerCandidates: number;
  roots: Root[];
}) {
  const w = row.word;
  return {
    id: w.id,
    phrase: w.phrase,
    category: w.category,
    about: w.about,
    userWants: w.userWants,
    plan: w.plan,
    firstSeenAt: w.firstSeenAt.toISOString(),
    lastSeenAt: w.lastSeenAt.toISOString(),
    curve: (w.curve ?? []) as { day: string; value: number }[],
    burstDay: w.burstDay,
    peakDay: w.peakDay,
    firstDay: w.firstDay,
    priority: w.priority,
    releasedOn: w.releasedOn,
    direction: w.direction,
    copyrightRisk: w.copyrightRisk === true,
    tails: (Array.isArray(w.tails) ? w.tails : []) as string[],
    growth7: w.growth7,
    spike: w.spike === "yes",
    isNew: w.isNew === "yes",
    fromZero: w.fromZero === "yes",
    rising: w.rising === "yes",
    preBurstShare: w.preBurstShare,
    ratio: w.ratio,
    ratioDay: w.ratioDay,
    searchVolume: w.searchVolume,
    keywordDifficulty: w.keywordDifficulty,
    cpcMicros: w.cpcMicros,
    dedicatedPages: w.dedicatedPages,
    innerCandidates: row.innerCandidates,
    serp: (w.serp ?? null) as
      { rank: number; site: string; url: string; title: string }[] | null,
    newSites: (w.newSites ?? null) as
      { domain: string; registeredOn: string }[] | null,
    verdict: w.verdict,
    buildAs: w.buildAs,
    reasons: w.reasons,
    rules: w.rules,
    checkedAt: w.checkedAt?.toISOString() ?? null,
    hidden: w.hiddenAt !== null,
    selectedAt: w.selectedAt?.toISOString() ?? null,
    origin: w.originCheckedAt
      ? {
          type: w.originType,
          summary: w.originSummary,
          capture: w.originCapture,
          evidence: (w.originEvidence ?? []) as StoredEvidence[],
          checkedAt: w.originCheckedAt.toISOString(),
        }
      : null,
    roots: row.roots
      .map((r) => ({ root: r.root, growth: r.growth }))
      .sort((a, b) => (b.growth ?? 0) - (a.growth ?? 0)),
  };
}

export type NewWordDto = ReturnType<typeof toNewWordDto>;
