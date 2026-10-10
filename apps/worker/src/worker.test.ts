import { expect, it, vi } from "vitest";

import { createMemoryQueue } from "@repo/jobs/adapters/memory";

import { workerEnv } from "./env";
import { createHandlers, startWorker } from "./worker";

const runner = {
  pendingRunIds: async () => [],
  execute: async () => null,
  failStaleRuns: async () => [],
};

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
    TREND_INTERVAL_MS: 3_600_000,
  });
  expect(
    workerEnv({ ...base, WORKER_QUEUE: "memory" }).HACKER_NEWS_ENABLED,
  ).toBeUndefined();
  expect(() =>
    workerEnv({ ...base, WORKER_QUEUE: "memory", TREND_INTERVAL_MS: "1000" }),
  ).toThrow("TREND_INTERVAL_MS");
  expect(() =>
    workerEnv({ ...base, WORKER_QUEUE: "memory", ALLOW_FAKE_PROVIDERS: "" }),
  ).toThrow("ALLOW_FAKE_PROVIDERS");
  const deepseek = {
    ...base,
    WORKER_QUEUE: "memory",
    ANALYST_PROVIDER: "deepseek",
  };
  expect(() => workerEnv(deepseek)).toThrow("DEEPSEEK_API_KEY");
  expect(() =>
    workerEnv({
      ...deepseek,
      DEEPSEEK_API_KEY: "sk-x",
      DEEPSEEK_MODEL: "gpt-4",
    }),
  ).toThrow("DEEPSEEK_MODEL");
  expect(
    workerEnv({
      ...deepseek,
      DEEPSEEK_API_KEY: "sk-x",
      DEEPSEEK_MODEL: "deepseek-flash",
    }).ANALYST_PROVIDER,
  ).toBe("deepseek");
  const dataforseo = {
    ...base,
    WORKER_QUEUE: "memory",
    KEYWORD_PROVIDER: "dataforseo",
  };
  expect(() => workerEnv(dataforseo)).toThrow("DATAFORSEO_LOGIN");
  expect(() =>
    workerEnv({ ...dataforseo, DATAFORSEO_LOGIN: "me@example.com" }),
  ).toThrow("DATAFORSEO_PASSWORD");
  try {
    workerEnv({ ...dataforseo, DATAFORSEO_PASSWORD: "dfs-secret" });
  } catch (error) {
    expect(String(error)).not.toContain("dfs-secret");
  }
  try {
    workerEnv({ ...deepseek, DEEPSEEK_API_KEY: "sk-secret-key" });
  } catch (error) {
    expect(String(error)).not.toContain("sk-secret-key");
  }
  try {
    workerEnv({ KEYWORD_PROVIDER: "fake" });
  } catch (error) {
    expect(String(error)).not.toContain("secret");
  }
});

it("collects the radar on trend.ingest and fails when it is disabled", async () => {
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  const queue = createMemoryQueue();
  let collected = 0;
  const radar = {
    collectHackerNews: async () => {
      collected++;
      return { saved: 1, skipped: 0, failed: 0 };
    },
  };
  const stop = await startWorker(
    queue,
    createHandlers({ runner, queue, radar }),
  );
  await queue.enqueue("trend.ingest", { provider: "hacker_news" });
  expect(await queue.drain()).toEqual([]);
  expect(collected).toBe(1);
  await stop();

  const disabled = createMemoryQueue();
  const stopDisabled = await startWorker(
    disabled,
    createHandlers({ runner, queue: disabled }),
  );
  await disabled.enqueue(
    "trend.ingest",
    { provider: "hacker_news" },
    { maxAttempts: 1 },
  );
  expect(await disabled.drain()).toHaveLength(1);
  await stopDisabled();
  log.mockRestore();
});

it("fails stale runs on each scan before it enqueues the pending ones", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  const calls: string[] = [];
  const scanning = {
    pendingRunIds: async () => {
      calls.push("pending");
      return [];
    },
    execute: async () => null,
    failStaleRuns: async () => {
      calls.push("stale");
      return ["run-1"];
    },
  };
  const queue = createMemoryQueue();
  const stop = await startWorker(
    queue,
    createHandlers({ runner: scanning, queue }),
  );
  await queue.enqueue("research.scan", {});
  expect(await queue.drain()).toEqual([]);
  expect(calls).toEqual(["stale", "pending"]);
  await stop();
  warn.mockRestore();
  log.mockRestore();
});
