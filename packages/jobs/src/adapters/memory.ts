import { randomUUID } from "node:crypto";

import type { JobName } from "../job-types";
import type {
  EnqueueOptions,
  Job,
  JobConsumer,
  JobHandlers,
  JobQueue,
} from "../queue";

type Entry = Job & { maxAttempts: number };

// Queue in process memory, for tests and local runs. Jobs are lost on restart:
// production needs a durable adapter, e.g. BullMQ on Redis (docs/architecture/jobs.md).
export function createMemoryQueue(): JobQueue &
  JobConsumer & {
    /** Runs every queued job once per call, retries included; returns failed job ids. */
    drain(): Promise<string[]>;
  } {
  const pending: Entry[] = [];
  const seen = new Set<string>();
  let handlers: JobHandlers = {};

  return {
    async enqueue(name, payload, options: EnqueueOptions = {}) {
      const id = options.jobId ?? randomUUID();
      if (!seen.has(id)) {
        seen.add(id);
        pending.push({
          id,
          name,
          payload,
          attempt: 1,
          maxAttempts: options.maxAttempts ?? 3,
        });
      }
      return { id };
    },
    async start(next) {
      handlers = next;
    },
    async stop() {
      handlers = {};
    },
    async drain() {
      const failed: string[] = [];
      while (pending.length > 0) {
        const entry = pending.shift()!;
        const handler = handlers[entry.name as JobName] as
          ((job: Job) => Promise<void>) | undefined;
        try {
          if (!handler) throw new Error(`No handler for ${entry.name}`);
          await handler(entry);
        } catch {
          if (entry.attempt < entry.maxAttempts)
            pending.push({ ...entry, attempt: entry.attempt + 1 });
          else failed.push(entry.id);
        }
      }
      return failed;
    },
  };
}
