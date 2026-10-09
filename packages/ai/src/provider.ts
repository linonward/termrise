// Port for the model a product calls. Replace the example adapter with a real one
// (fal, Replicate, OpenAI…) in adapters/; services depend only on this interface.
// Long jobs (video, large images) need an async design: docs/architecture/tasks.md#sync-vs-async.
export interface AiProvider {
  name: string;
  run(input: string): Promise<{ output: string }>;
}
