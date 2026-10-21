import type { Job, JobQueue } from "@repo/jobs/queue";
import { logger } from "@repo/observability/logger";
import type { createResearchRunner } from "@repo/research/research-runner";
import type { createSeedSuggester } from "@repo/research/seed-suggestions";

type Runner = Pick<
  ReturnType<typeof createResearchRunner>,
  "pendingRunIds" | "execute" | "failStaleRuns"
>;
type Suggester = ReturnType<typeof createSeedSuggester>;

// The API queues research runs as database rows; these processors pick them up
// (docs/architecture/jobs.md). Both are idempotent: the job id dedupes a run's job, and
// execute() claims a run with one conditional update.
// Seed suggestions go the same way; without a suggester the scan leaves them waiting.
export function researchProcessors(deps: {
  runner: Runner;
  queue: JobQueue;
  suggester?: Suggester;
}) {
  return {
    async "research.scan"() {
      // Runs whose worker died: fail them so their projects can run again.
      const stale = await deps.runner.failStaleRuns();
      if (stale.length > 0)
        logger.warn("research.stale_runs_failed", { count: stale.length });
      for (const runId of await deps.runner.pendingRunIds())
        await deps.queue.enqueue(
          "research.run",
          { runId },
          { jobId: `research-run-${runId}`, maxAttempts: 1 },
        );
      if (!deps.suggester) return;
      const staleSuggestions = await deps.suggester.failStale();
      if (staleSuggestions.length > 0)
        logger.warn("seeds.stale_suggestions_failed", {
          count: staleSuggestions.length,
        });
      for (const suggestionId of await deps.suggester.pendingIds())
        await deps.queue.enqueue(
          "seeds.suggest",
          { suggestionId },
          { jobId: `seeds-suggest-${suggestionId}`, maxAttempts: 1 },
        );
    },
    async "seeds.suggest"(job: Job<"seeds.suggest">) {
      if (!deps.suggester) throw new Error("No seed suggester");
      const row = await deps.suggester.execute(job.payload.suggestionId);
      logger.info("seeds.suggest_executed", {
        suggestionId: job.payload.suggestionId,
        status: row?.status ?? "already_claimed",
      });
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
