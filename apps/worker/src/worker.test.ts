import { expect, it, vi } from "vitest";

import { createMemoryQueue } from "@repo/jobs/adapters/memory";

import { startWorker } from "./worker";

it("processes an enqueued example job", async () => {
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  const queue = createMemoryQueue();
  const stop = await startWorker(queue);
  await queue.enqueue("example.echo", { text: "hello" });
  expect(await queue.drain()).toEqual([]);
  expect(JSON.parse(log.mock.calls[0]![0] as string)).toMatchObject({
    eventType: "job.example_echo",
    length: 5,
  });
  await stop();
  log.mockRestore();
});
