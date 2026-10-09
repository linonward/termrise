import { logger } from "@repo/observability/logger";

// Skeleton entry point. A durable queue adapter (e.g. BullMQ on Redis) is not
// part of the starter yet; add one in @repo/jobs, then start it here with
// startWorker(consumer) from ./worker (docs/architecture/jobs.md).
logger.warn("worker.no_queue_adapter", {
  hint: "Add a durable JobConsumer adapter before running the worker.",
});
process.exit(1);
