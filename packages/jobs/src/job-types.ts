// Every job name and its payload. Add a product job here; payloads must be JSON
// and must not hold secrets, full prompts or emails (docs/architecture/jobs.md).
export interface JobPayloads {
  /** Example job used by the worker skeleton and its test. */
  "example.echo": { text: string };
}

export type JobName = keyof JobPayloads;
