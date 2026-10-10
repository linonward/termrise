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
