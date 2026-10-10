import type {
  keywordMetricSnapshots,
  keywords,
  opportunities,
  opportunityDecisions,
  opportunityEvaluations,
  researchRuns,
  validationExperiments,
  serpResults,
  serpSnapshots,
} from "@repo/db/schema";

import type { Budget } from "./budget";
import type { BuildAdvice } from "./build-advice";
import type { Analysis } from "./opportunity-analyst";
import { NEXT_DECISIONS, NEXT_EXPERIMENT_STATUSES } from "./opportunity-rules";
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

type OpportunityRow = typeof opportunities.$inferSelect;
type EvaluationRow = typeof opportunityEvaluations.$inferSelect;

// An opportunity with its current evaluation; the analysis stays as validated.
export function toOpportunityDto(row: {
  opportunity: OpportunityRow;
  evaluation: EvaluationRow;
  projectName: string;
}) {
  const e = row.evaluation;
  return {
    id: row.opportunity.id,
    projectId: row.opportunity.projectId,
    starred: row.opportunity.starredAt !== null,
    projectName: row.projectName,
    cluster: row.opportunity.cluster,
    status: row.opportunity.status,
    /** What the owner can decide next (opportunity-rules.ts). */
    nextDecisions: NEXT_DECISIONS[row.opportunity.status],
    score: e.score,
    dimensions: e.dimensions,
    confidence: e.confidence,
    needsReview: e.needsReview,
    rank: e.rank,
    scoringVersion: e.scoringVersion,
    analysis: e.analysis as Analysis | null,
    analysisError: e.analysisError,
    analystProvider: e.analystProvider,
    analystModel: e.analystModel,
    serpCompetition: e.serpCompetition,
    buildAdvice: e.buildAdvice as BuildAdvice | null,
    evaluatedAt: e.createdAt.toISOString(),
  };
}

export type OpportunityDto = ReturnType<typeof toOpportunityDto>;

export function toDecisionDto(row: {
  decision: typeof opportunityDecisions.$inferSelect;
  deciderName: string;
  scoringVersion: string;
  score: number;
}) {
  return {
    id: row.decision.id,
    decision: row.decision.decision,
    reason: row.decision.reason,
    deciderName: row.deciderName,
    /** The evidence version the decision was made on. */
    evaluationId: row.decision.evaluationId,
    scoringVersion: row.scoringVersion,
    score: row.score,
    createdAt: row.decision.createdAt.toISOString(),
  };
}

export type DecisionDto = ReturnType<typeof toDecisionDto>;

export function toExperimentDto(e: typeof validationExperiments.$inferSelect) {
  return {
    id: e.id,
    kind: e.kind,
    hypothesis: e.hypothesis,
    channel: e.channel,
    metric: e.metric,
    budgetUsd: e.budgetMicros / 1_000_000,
    durationDays: e.durationDays,
    successThreshold: e.successThreshold,
    stopCondition: e.stopCondition,
    status: e.status,
    nextStatuses: NEXT_EXPERIMENT_STATUSES[e.status],
    resultNote: e.resultNote,
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
  };
}

export type ExperimentDto = ReturnType<typeof toExperimentDto>;

/** The detail page's data: the opportunity, its evidence, decisions and experiments. */
export function toOpportunityDetailDto(
  detail: Parameters<typeof toOpportunityDto>[0] & {
    keywords: Parameters<typeof toKeywordDto>[0][];
    serps: Parameters<typeof toSerpDto>[0][];
    signals: SourceSignal[];
    decisions: Parameters<typeof toDecisionDto>[0][];
    experiments: (typeof validationExperiments.$inferSelect)[];
  },
) {
  return {
    ...toOpportunityDto(detail),
    keywords: detail.keywords.map(toKeywordDto),
    serps: detail.serps.map(toSerpDto),
    signals: detail.signals.map(toSourceSignalDto),
    decisions: detail.decisions.map(toDecisionDto),
    experiments: detail.experiments.map(toExperimentDto),
  };
}

export type OpportunityDetailDto = ReturnType<typeof toOpportunityDetailDto>;

/** A project's budgets and paid calls, in USD (docs/architecture/data-model.md#budget-ledger). */
export function toCostsDto(usage: Awaited<ReturnType<Budget["usage"]>>) {
  const usd = (micros: number) => micros / 1_000_000;
  const budget = (b: (typeof usage)["data"]) => ({
    budgetUsd: usd(b.budget),
    spentUsd: usd(b.spent),
    heldUsd: usd(b.held),
    remainingUsd: usd(b.remaining),
  });
  return {
    data: budget(usage.data),
    ai: budget(usage.ai),
    calls: usage.calls.map((c) => ({
      id: c.id,
      kind: c.kind,
      provider: c.provider,
      operation: c.operation,
      reservedUsd: usd(c.reservedMicros),
      costUsd: c.costMicros === null ? null : usd(c.costMicros),
      status: c.status,
      createdAt: c.createdAt.toISOString(),
    })),
  };
}

export type CostsDto = ReturnType<typeof toCostsDto>;
