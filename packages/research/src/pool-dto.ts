// Public shapes of the keyword pool (docs/architecture/api.md).
import type { PoolCheck, PoolKeyword, PoolRound } from "./pool-service";

export function toPoolKeywordDto(k: PoolKeyword) {
  return {
    id: k.id,
    phrase: k.phrase,
    sources: k.sources,
    status: k.status,
    reasons: k.reasons,
    searchVolume: k.searchVolume,
    keywordDifficulty: k.keywordDifficulty,
    cpcMicros: k.cpcMicros,
    variants: k.variants,
    variantCount: k.variantCount,
    strongCompetitors: k.strongCompetitors,
    innerPages: k.innerPages,
    trend: k.trend,
    monetization: k.monetization,
    compliance: k.compliance,
    aiAngle: k.aiAngle,
    firstSeenAt: k.firstSeenAt.toISOString(),
    lastCheckedAt: k.lastCheckedAt?.toISOString() ?? null,
    nextCheckAt: k.nextCheckAt?.toISOString() ?? null,
    updatedAt: k.updatedAt.toISOString(),
  };
}

// The reviewer is kept in the database, not shown.
export function toPoolCheckDto(c: PoolCheck) {
  return {
    id: c.id,
    roundId: c.roundId,
    kind: c.kind,
    status: c.status,
    reasons: c.reasons,
    data: c.data,
    rules: c.rules,
    createdAt: c.createdAt.toISOString(),
  };
}

export function toPoolRoundDto({
  round,
  spentMicros,
}: {
  round: PoolRound;
  spentMicros: number;
}) {
  return {
    id: round.id,
    kind: round.kind,
    source: round.source,
    status: round.status,
    errorCode: round.errorCode,
    report: round.report,
    spentMicros,
    createdAt: round.createdAt.toISOString(),
    claimedAt: round.claimedAt?.toISOString() ?? null,
    finishedAt: round.finishedAt?.toISOString() ?? null,
  };
}
