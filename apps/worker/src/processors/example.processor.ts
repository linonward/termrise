import type { Job } from "@repo/jobs/queue";
import { logger } from "@repo/observability/logger";

// Example processor. A real one calls a service (credits, AI provider) and must be
// idempotent: a job can run again after a crash or a retry.
export async function processExampleEcho(job: Job<"example.echo">) {
  logger.info("job.example_echo", {
    jobId: job.id,
    length: job.payload.text.length,
  });
}
