import { expect, it, vi } from "vitest";

import type { Job } from "../queue";
import { createMemoryQueue } from "./memory";

it("runs each job once and adds a repeated job id once", async () => {
  const queue = createMemoryQueue();
  const echo = vi.fn(async (job: Job<"example.echo">) => void job);
  await queue.start({ "example.echo": echo });
  await queue.enqueue("example.echo", { text: "a" }, { jobId: "j1" });
  await queue.enqueue("example.echo", { text: "a" }, { jobId: "j1" });
  expect(await queue.drain()).toEqual([]);
  expect(echo).toHaveBeenCalledTimes(1);
  expect(echo.mock.calls[0]![0]).toMatchObject({
    id: "j1",
    payload: { text: "a" },
    attempt: 1,
  });
});

it("retries a failing job, then reports it as failed", async () => {
  const queue = createMemoryQueue();
  const attempts: number[] = [];
  await queue.start({
    "example.echo": async (job) => {
      attempts.push(job.attempt);
      throw new Error("boom");
    },
  });
  const { id } = await queue.enqueue(
    "example.echo",
    { text: "a" },
    { maxAttempts: 2 },
  );
  expect(await queue.drain()).toEqual([id]);
  expect(attempts).toEqual([1, 2]);
});

it("fails a job that has no handler", async () => {
  const queue = createMemoryQueue();
  await queue.start({});
  const { id } = await queue.enqueue(
    "example.echo",
    { text: "a" },
    { maxAttempts: 1 },
  );
  expect(await queue.drain()).toEqual([id]);
});
