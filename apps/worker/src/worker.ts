import type { JobConsumer, JobHandlers, JobQueue } from "@repo/jobs/queue";

import { processExampleEcho } from "./processors/example.processor";
import { researchProcessors } from "./processors/research.processor";

// Every job name the worker handles, mapped to its processor.
export function createHandlers(
  deps: Parameters<typeof researchProcessors>[0],
): JobHandlers {
  return {
    "example.echo": processExampleEcho,
    ...researchProcessors(deps),
  };
}

export async function startWorker(
  consumer: JobConsumer,
  handlers: JobHandlers,
) {
  await consumer.start(handlers);
  return () => consumer.stop();
}

export type { JobQueue };
