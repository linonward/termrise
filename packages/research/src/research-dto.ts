import type {
  keywordMetricSnapshots,
  keywords,
  researchRuns,
  serpResults,
  serpSnapshots,
} from "@repo/db/schema";

import type { ResearchProject, SourceSignal } from "./research-service";

const usd = (micros: number) => micros / 1_000_000;

// Public shape of a research project in API responses: budgets in US dollars.
export function toResearchProjectDto(p: ResearchProject) {
  return {
    id: p.id,
    name: p.name,
    locationCode: p.locationCode,
    languageCode: p.languageCode,
    seeds: p.seeds,
    dataBudgetUsd: usd(p.dataBudgetMicros),
    aiBudgetUsd: usd(p.aiBudgetMicros),
    status: p.status,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

export type ResearchProjectDto = ReturnType<typeof toResearchProjectDto>;

// Public shape of a source signal: no project id or row hash.
export function toSourceSignalDto(s: SourceSignal) {
  return {
    id: s.id,
    provider: s.provider,
    term: s.normalizedTerm,
    rawTitle: s.rawTitle,
    url: s.url,
    observedAt: s.observedAt?.toISOString() ?? null,
    ingestedAt: s.ingestedAt.toISOString(),
    source: s.metadata.source ?? null,
    note: s.metadata.note ?? null,
  };
}

export type SourceSignalDto = ReturnType<typeof toSourceSignalDto>;

type RunRow = typeof researchRuns.$inferSelect;
type KeywordRow = typeof keywords.$inferSelect;
type MetricRow = typeof keywordMetricSnapshots.$inferSelect;
type SerpSnapshotRow = typeof serpSnapshots.$inferSelect;
type SerpResultRow = typeof serpResults.$inferSelect;

export function toResearchRunDto(r: RunRow) {
  return {
    id: r.id,
    status: r.status,
    stage: r.stage,
    errorCode: r.errorCode,
    startedAt: r.startedAt.toISOString(),
    finishedAt: r.finishedAt?.toISOString() ?? null,
  };
}

export type ResearchRunDto = ReturnType<typeof toResearchRunDto>;

// Metrics in display units; null stays null ("no data").
export function toKeywordDto(row: {
  keyword: KeywordRow;
  metrics: MetricRow | null;
}) {
  const m = row.metrics;
  return {
    id: row.keyword.id,
    phrase: row.keyword.phrase,
    source: row.keyword.source,
    seed: row.keyword.seed,
    provider: m?.provider ?? null,
    searchVolume: m?.searchVolume ?? null,
    cpcUsd: m?.cpcMicros == null ? null : m.cpcMicros / 1_000_000,
    adsCompetition: m?.adsCompetition ?? null,
    keywordDifficulty: m?.keywordDifficulty ?? null,
    fetchedAt: m?.fetchedAt.toISOString() ?? null,
  };
}

export type KeywordDto = ReturnType<typeof toKeywordDto>;

export function toSerpDto(row: {
  phrase: string;
  snapshot: SerpSnapshotRow;
  results: SerpResultRow[];
}) {
  return {
    phrase: row.phrase,
    provider: row.snapshot.provider,
    device: row.snapshot.device,
    fetchedAt: row.snapshot.fetchedAt.toISOString(),
    results: row.results.map((r) => ({
      rank: r.rank,
      url: r.url,
      title: r.title,
      type: r.type,
    })),
  };
}

export type SerpDto = ReturnType<typeof toSerpDto>;
