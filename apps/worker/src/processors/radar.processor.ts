import type { Job } from "@repo/jobs/queue";
import { logger } from "@repo/observability/logger";
import type { createRadar } from "@repo/research/radar";

type Radar = Pick<ReturnType<typeof createRadar>, "collectHackerNews">;

// Scheduled collection of public sources into the radar (docs/architecture/jobs.md).
// Without a radar (HACKER_NEWS_ENABLED unset) the job fails, so a stale schedule shows up.
export function radarProcessors(deps: { radar?: Radar }) {
  return {
    async "trend.ingest"(job: Job<"trend.ingest">) {
      if (!deps.radar) throw new Error("Radar collection is disabled");
      const result = await deps.radar.collectHackerNews();
      logger.info("radar.collected", {
        provider: job.payload.provider,
        ...result,
      });
    },
  };
}
