import { expect, it, vi } from "vitest";

import { createMemoryQueue } from "@repo/jobs/adapters/memory";

import { workerEnv } from "./env";
import { createHandlers, startWorker } from "./worker";

const runner = { pendingRunIds: async () => [], execute: async () => null };

it("processes an enqueued example job", async () => {
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  const queue = createMemoryQueue();
  const stop = await startWorker(queue, createHandlers({ runner, queue }));
  await queue.enqueue("example.echo", { text: "hello" });
  expect(await queue.drain()).toEqual([]);
  expect(JSON.parse(log.mock.calls[0]![0] as string)).toMatchObject({
    eventType: "job.example_echo",
    length: 5,
  });
  await stop();
  log.mockRestore();
});

it("validates its own environment and never echoes values", () => {
  const base = {
    DATABASE_URL: "postgresql://secret@x/db",
    KEYWORD_PROVIDER: "fake",
    ANALYST_PROVIDER: "fake",
    ALLOW_FAKE_PROVIDERS: "1",
  };
  expect(() => workerEnv(base)).toThrow("REDIS_URL");
  expect(workerEnv({ ...base, WORKER_QUEUE: "memory" })).toMatchObject({
    SCAN_INTERVAL_MS: 5000,
    PORT: 8080,
  });
  expect(() =>
    workerEnv({ ...base, WORKER_QUEUE: "memory", ALLOW_FAKE_PROVIDERS: "" }),
  ).toThrow("ALLOW_FAKE_PROVIDERS");
  try {
    workerEnv({ KEYWORD_PROVIDER: "fake" });
  } catch (error) {
    expect(String(error)).not.toContain("secret");
  }
});
