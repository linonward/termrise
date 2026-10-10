import type { Job, JobQueue } from "@repo/jobs/queue";
import { logger } from "@repo/observability/logger";
import type { createResearchRunner } from "@repo/research/research-runner";

type Runner = Pick<
  ReturnType<typeof createResearchRunner>,
  "pendingRunIds" | "execute"
>;

// The API queues research runs as database rows; these processors pick them up
// (docs/architecture/jobs.md). Both are idempotent: the job id dedupes a run's job, and
// execute() claims a run with one conditional update.
export function researchProcessors(deps: { runner: Runner; queue: JobQueue }) {
  return {
    async "research.scan"() {
      for (const runId of await deps.runner.pendingRunIds())
        await deps.queue.enqueue(
          "research.run",
          { runId },
          { jobId: `research-run-${runId}`, maxAttempts: 1 },
        );
    },
    async "research.run"(job: Job<"research.run">) {
      const run = await deps.runner.execute(job.payload.runId);
      logger.info("research.run_executed", {
        runId: job.payload.runId,
        status: run?.status ?? "already_claimed",
      });
    },
  };
}
