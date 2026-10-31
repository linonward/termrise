// Every job name and its payload. Add a product job here; payloads must be JSON
// and must not hold secrets, full prompts or emails (docs/architecture/jobs.md).
export interface JobPayloads {
  /** Example job used by the worker skeleton and its test. */
  "example.echo": { text: string };
  /** Finds queued research runs and seed suggestions and enqueues a job each. Scheduled. */
  "research.scan": Record<string, never>;
  /** Executes one queued research run (packages/research research-runner.ts). */
  "research.run": { runId: string };
  /** Runs one queued seed suggestion (packages/research seed-suggestions.ts). */
  "seeds.suggest": { suggestionId: string };
  /**
   * Queues today's daily keyword pool round when it is due, fails stale rounds and runs
   * one queued round (packages/research pool-round.ts). Scheduled.
   */
  "pool.scan": Record<string, never>;
  /** Collects one public source into the radar (packages/research radar.ts). Scheduled. */
  "trend.ingest": { provider: "hacker_news" | "google_trends" };
}

export type JobName = keyof JobPayloads;
