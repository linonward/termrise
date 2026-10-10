import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";

import type { JobName, JobPayloads } from "@repo/jobs/job-types";
import type { Job, JobConsumer, JobHandlers, JobQueue } from "@repo/jobs/queue";

const QUEUE = "termrise";

// The durable queue on Redis (docs/adr/011-worker.md): BullMQ stays in this app.
export function createBullQueue(redisUrl: string) {
  // BullMQ requires maxRetriesPerRequest: null on a worker's connection.
  const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
  const queue = new Queue(QUEUE, { connection });
  let worker: Worker | undefined;

  const bull: JobQueue &
    JobConsumer & {
      /** Enqueues the job every `everyMs`; calling it again updates, never duplicates. */
      schedule<N extends JobName>(
        name: N,
        everyMs: number,
        payload?: JobPayloads[N],
      ): Promise<void>;
      /** Stops a schedule; nothing happens when there is none. */
      unschedule(name: JobName): Promise<void>;
    } = {
    async enqueue(name, payload, options = {}) {
      const job = await queue.add(name, payload, {
        jobId: options.jobId,
        attempts: options.maxAttempts ?? 3,
        backoff: { type: "exponential", delay: 1000 },
        removeOnComplete: 1000,
        removeOnFail: 1000,
      });
      return { id: job.id ?? "" };
    },
    async schedule(name, everyMs, payload) {
      await queue.upsertJobScheduler(
        `schedule-${name}`,
        { every: everyMs },
        {
          name,
          data: payload ?? {},
          opts: { removeOnComplete: 100, removeOnFail: 100 },
        },
      );
    },
    async unschedule(name) {
      await queue.removeJobScheduler(`schedule-${name}`);
    },
    async start(handlers: JobHandlers) {
      worker = new Worker(
        QUEUE,
        async (job) => {
          const handler = handlers[job.name as JobName] as
            ((job: Job) => Promise<void>) | undefined;
          if (!handler) throw new Error(`No handler for ${job.name}`);
          await handler({
            id: job.id ?? "",
            name: job.name as JobName,
            payload: job.data,
            attempt: job.attemptsMade + 1,
          });
        },
        { connection, concurrency: 2 },
      );
    },
    async stop() {
      await worker?.close();
      await queue.close();
      connection.disconnect();
    },
  };
  return bull;
}
