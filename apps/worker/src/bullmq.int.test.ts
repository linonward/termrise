import { Redis } from "ioredis";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createBullQueue } from "./bullmq";

// Needs Redis: docker compose up -d redis locally; CI sets TEST_REDIS_URL.
const url = process.env.TEST_REDIS_URL;

describe.skipIf(!url)("BullMQ queue", () => {
  const redis = url ? new Redis(url) : undefined;
  beforeEach(async () => {
    await redis!.flushdb();
  });
  afterAll(() => redis?.disconnect());

  const waitFor = async (check: () => boolean, ms = 5000) => {
    const end = Date.now() + ms;
    while (!check()) {
      if (Date.now() > end) throw new Error("timed out");
      await new Promise((r) => setTimeout(r, 25));
    }
  };

  it("adds a job id once, retries, and stops after the last attempt", async () => {
    const queue = createBullQueue(url!);
    const seen: string[] = [];
    let attempts = 0;
    await queue.start({
      "example.echo": async (job) => {
        seen.push(job.payload.text);
      },
      "research.run": async () => {
        attempts++;
        throw new Error("fails");
      },
    });
    await queue.enqueue("example.echo", { text: "a" }, { jobId: "same" });
    await queue.enqueue("example.echo", { text: "b" }, { jobId: "same" });
    await queue.enqueue("research.run", { runId: "r" }, { maxAttempts: 2 });
    await waitFor(() => seen.length === 1 && attempts === 2);
    await new Promise((r) => setTimeout(r, 1500));
    expect(seen).toEqual(["a"]);
    expect(attempts).toBe(2);
    await queue.stop();
  });

  it("schedules a repeating job", async () => {
    const queue = createBullQueue(url!);
    let scans = 0;
    await queue.start({
      "research.scan": async () => {
        scans++;
      },
    });
    await queue.schedule("research.scan", 200);
    await queue.schedule("research.scan", 200);
    await waitFor(() => scans >= 2);
    await queue.stop();
  });
});
