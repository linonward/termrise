import type {
  DECISIONS,
  EXPERIMENT_STATUSES,
  OPPORTUNITY_STATUSES,
} from "@repo/db/schema";

// Pure rules for decisions and experiments; the DTOs carry the allowed next steps.

export type Decision = (typeof DECISIONS)[number];
type Status = (typeof OPPORTUNITY_STATUSES)[number];
type ExperimentStatus = (typeof EXPERIMENT_STATUSES)[number];

// Unreviewed → needs_validation → go / no_go (docs/product/product.md#评分与状态).
// Go needs validation first; no-go is possible at once; a decided one can be reopened.
export const NEXT_DECISIONS: Record<Status, readonly Decision[]> = {
  unreviewed: ["needs_validation", "no_go"],
  needs_validation: ["go", "no_go"],
  go: ["needs_validation"],
  no_go: ["needs_validation"],
};

// Planned → running → passed / failed; planned or running → stopped. The end is final.
export const NEXT_EXPERIMENT_STATUSES: Record<
  ExperimentStatus,
  readonly ExperimentStatus[]
> = {
  planned: ["running", "stopped"],
  running: ["passed", "failed", "stopped"],
  passed: [],
  failed: [],
  stopped: [],
};

export const REASON_MAX_LENGTH = 1000;

/** Opportunities shown side by side on the compare page. */
export const MAX_COMPARED = 4;
