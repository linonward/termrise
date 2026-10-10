import type { ResearchProject } from "./research-service";

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
