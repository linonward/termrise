import {
  Activity,
  Archive,
  Ban,
  Calendar,
  ChartLine,
  CircleCheck,
  CircleDashed,
  CircleX,
  FileText,
  FlaskConical,
  Globe,
  Hammer,
  Hourglass,
  LoaderCircle,
  Minus,
  OctagonX,
  PencilLine,
  Repeat,
  Rocket,
  ShieldCheck,
  Sprout,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";

import type { ExecutionProjectDto } from "@repo/execution/execution-dto";
import type { PoolKeywordDto, PoolRoundDto } from "@repo/research/pool-dto";
import type { RadarItemDto } from "@repo/research/radar-dto";
import type {
  ExperimentDto,
  OpportunityDetailDto,
  OpportunityDto,
  ResearchProjectDto,
  ResearchRunDto,
} from "@repo/research/research-dto";
import type { BadgeTone } from "@repo/ui/components/badge";

// The tone and icon of each status badge (docs/design/design-system.md#status).
export type StatusBadge = { tone: BadgeTone; icon: LucideIcon };

const success: StatusBadge = { tone: "success", icon: CircleCheck };
const danger: StatusBadge = { tone: "danger", icon: CircleX };
const loading: StatusBadge = { tone: "info", icon: LoaderCircle };
const partial: StatusBadge = { tone: "neutral", icon: CircleDashed };
const cancelled: StatusBadge = { tone: "neutral", icon: Ban };

export function researchBadge(
  status: ResearchProjectDto["status"],
): StatusBadge {
  if (status === "draft") return { tone: "neutral", icon: PencilLine };
  if (status === "completed") return success;
  if (status === "partial") return partial;
  if (status === "failed" || status === "budget_exhausted") return danger;
  if (status === "cancelled") return cancelled;
  return loading;
}

export function runBadge(status: ResearchRunDto["status"]): StatusBadge {
  if (status === "pending") return { tone: "info", icon: Hourglass };
  if (status === "running") return loading;
  if (status === "completed") return success;
  if (status === "partial") return partial;
  if (status === "cancelled") return cancelled;
  return danger;
}

export function opportunityBadge(
  status: OpportunityDto["status"],
): StatusBadge {
  if (status === "go") return success;
  if (status === "no_go") return danger;
  if (status === "needs_validation")
    return { tone: "info", icon: FlaskConical };
  return partial;
}

/** A high score on thin evidence, or a cluster mostly off topic. */
export const needsReviewBadge: StatusBadge = {
  tone: "warning",
  icon: TriangleAlert,
};

export function buildAdviceBadge(
  advice: NonNullable<OpportunityDetailDto["buildAdvice"]>["advice"],
): StatusBadge {
  if (advice === "new_site") return { tone: "success", icon: Globe };
  if (advice === "inner_page") return { tone: "info", icon: FileText };
  if (advice === "weak_demand") return { tone: "neutral", icon: TrendingDown };
  return { tone: "neutral", icon: Minus };
}

export function lifecycleBadge(
  lifecycle: RadarItemDto["lifecycle"],
): StatusBadge {
  if (lifecycle === "breakout") return { tone: "success", icon: TrendingUp };
  if (lifecycle === "emerging") return { tone: "info", icon: Sprout };
  if (lifecycle === "sustained") return { tone: "neutral", icon: Activity };
  if (lifecycle === "recurring") return { tone: "neutral", icon: Repeat };
  if (lifecycle === "seasonal") return { tone: "neutral", icon: Calendar };
  return { tone: "neutral", icon: Minus };
}

export function productBadge(
  status: ExecutionProjectDto["status"],
): StatusBadge {
  if (status === "validating") return { tone: "info", icon: FlaskConical };
  if (status === "building") return { tone: "info", icon: Hammer };
  if (status === "launched") return { tone: "success", icon: Rocket };
  if (status === "measuring") return { tone: "success", icon: ChartLine };
  if (status === "archived") return { tone: "neutral", icon: Archive };
  return partial;
}

export function experimentBadge(status: ExperimentDto["status"]): StatusBadge {
  if (status === "planned") return { tone: "neutral", icon: Calendar };
  if (status === "running") return loading;
  if (status === "passed") return success;
  if (status === "failed") return danger;
  return { tone: "neutral", icon: OctagonX };
}

/** Only a verified payment is a status; manual and imported numbers are a Tag. */
export function revenueSourceBadge(source: string): StatusBadge | null {
  return source === "payment_verified"
    ? { tone: "success", icon: ShieldCheck }
    : null;
}

/** A keyword's status in the pool (docs/product/keyword-pool.md#statuses). */
export function poolBadge(status: PoolKeywordDto["status"]): StatusBadge {
  switch (status) {
    case "candidate":
      return success;
    case "selected":
      return { tone: "success", icon: Rocket };
    case "queued":
    case "new":
      return { tone: "info", icon: Hourglass };
    case "watch":
      return { tone: "warning", icon: TrendingUp };
    case "unsure":
      return { tone: "warning", icon: TriangleAlert };
    case "failed":
      return danger;
    case "excluded":
      return { tone: "neutral", icon: OctagonX };
    case "dropped":
      return { tone: "neutral", icon: Archive };
  }
}

/** A pool round's status. */
export function poolRoundBadge(status: PoolRoundDto["status"]): StatusBadge {
  switch (status) {
    case "queued":
      return { tone: "info", icon: Hourglass };
    case "running":
      return loading;
    case "completed":
      return success;
    case "partial":
      return partial;
    case "budget_exhausted":
      return { tone: "warning", icon: TriangleAlert };
    case "failed":
      return danger;
  }
}
