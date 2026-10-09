import type { JobName, JobPayloads } from "./job-types";

export type Job<N extends JobName = JobName> = {
  id: string;
  name: N;
  payload: JobPayloads[N];
  /** 1 on the first run, then +1 per retry. */
  attempt: number;
};

export type EnqueueOptions = {
  /** Same id twice adds the job once, like an idempotency key. */
  jobId?: string;
  /** Runs before the job is dropped as failed. Default 3. */
  maxAttempts?: number;
};

/** Producer side: apps enqueue jobs. */
export interface JobQueue {
  enqueue<N extends JobName>(
    name: N,
    payload: JobPayloads[N],
    options?: EnqueueOptions,
  ): Promise<{ id: string }>;
}

export type JobHandlers = {
  [N in JobName]?: (job: Job<N>) => Promise<void>;
};

/** Consumer side: the worker app runs handlers until stopped. */
export interface JobConsumer {
  start(handlers: JobHandlers): Promise<void>;
  stop(): Promise<void>;
}
