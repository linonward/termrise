import { revenueTotals } from "./execution-rules";
import type {
  ExecutionEvent,
  ExecutionProject,
  RevenueEvent,
} from "./execution-service";

// JSON shapes of execution data for the API and the web app.

export function toExecutionProjectDto(p: ExecutionProject) {
  return {
    id: p.id,
    opportunityId: p.opportunityId,
    name: p.name,
    repoUrl: p.repoUrl,
    domain: p.domain,
    launchedOn: p.launchedOn,
    status: p.status,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

export type ExecutionProjectDto = ReturnType<typeof toExecutionProjectDto>;

export function toExecutionEventDto(e: ExecutionEvent) {
  return {
    id: e.id,
    metric: e.metric,
    count: e.count,
    periodStart: e.periodStart,
    periodEnd: e.periodEnd,
    source: e.source,
    note: e.note,
    createdAt: e.createdAt.toISOString(),
  };
}

export type ExecutionEventDto = ReturnType<typeof toExecutionEventDto>;

export function toRevenueEventDto(r: RevenueEvent) {
  return {
    id: r.id,
    occurredOn: r.occurredOn,
    currency: r.currency,
    orders: r.orders,
    gross: r.grossMinor / 100,
    refund: r.refundMinor / 100,
    fees: r.feesMinor === null ? null : r.feesMinor / 100,
    source: r.source,
    evidence: r.evidence,
    note: r.note,
    createdAt: r.createdAt.toISOString(),
  };
}

export type RevenueEventDto = ReturnType<typeof toRevenueEventDto>;

/** The project page: the product, its records and their totals. */
export function toExecutionDetailDto(detail: {
  project: ExecutionProject;
  events: ExecutionEvent[];
  revenue: RevenueEvent[];
}) {
  const sum = (metric: ExecutionEvent["metric"]) =>
    detail.events
      .filter((e) => e.metric === metric)
      .reduce((total, e) => total + e.count, 0);
  return {
    ...toExecutionProjectDto(detail.project),
    events: detail.events.map(toExecutionEventDto),
    revenue: detail.revenue.map(toRevenueEventDto),
    totals: {
      visitors: sum("visitors"),
      activations: sum("activations"),
      revenue: revenueTotals(detail.revenue).map((t) => ({
        currency: t.currency,
        orders: t.orders,
        verifiedOrders: t.verifiedOrders,
        gross: t.grossMinor / 100,
        refund: t.refundMinor / 100,
        fees: t.feesMinor === null ? null : t.feesMinor / 100,
        net: t.netMinor === null ? null : t.netMinor / 100,
      })),
    },
  };
}

export type ExecutionDetailDto = ReturnType<typeof toExecutionDetailDto>;
