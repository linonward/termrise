import type { JobConsumer, JobHandlers } from "@repo/jobs/queue";

import { processExampleEcho } from "./processors/example.processor";

// Every job name the worker handles, mapped to its processor.
export const handlers: JobHandlers = {
  "example.echo": processExampleEcho,
};

export async function startWorker(consumer: JobConsumer) {
  await consumer.start(handlers);
  return () => consumer.stop();
}
