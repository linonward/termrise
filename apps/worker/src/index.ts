import { createServer } from "node:http";

import { createDb } from "@repo/db/client";
import { createMemoryQueue } from "@repo/jobs/adapters/memory";
import { logger } from "@repo/observability/logger";
import { createFakeAnalyst } from "@repo/research/adapters/fake-analyst";
import { createFakeKeywordProvider } from "@repo/research/adapters/fake-keywords";
import { createResearchRunner } from "@repo/research/research-runner";

import { createBullQueue } from "./bullmq";
import { workerEnv } from "./env";
import { createHandlers, startWorker } from "./worker";

// The worker process (docs/architecture/jobs.md): a scheduler finds queued research runs,
// BullMQ runs them. WORKER_QUEUE=memory keeps the jobs in this process, for E2E only.
async function main() {
  const env = workerEnv(process.env);
  const database = createDb(env.DATABASE_URL);
  const runner = createResearchRunner({
    database,
    provider: createFakeKeywordProvider(),
    analyst: createFakeAnalyst(),
  });

  const stops: (() => Promise<unknown>)[] = [];
  if (env.WORKER_QUEUE === "bullmq") {
    const queue = createBullQueue(env.REDIS_URL!);
    stops.push(await startWorker(queue, createHandlers({ runner, queue })));
    await queue.schedule("research.scan", env.SCAN_INTERVAL_MS);
  } else {
    const queue = createMemoryQueue();
    stops.push(await startWorker(queue, createHandlers({ runner, queue })));
    let busy = false;
    const timer = setInterval(async () => {
      if (busy) return;
      busy = true;
      try {
        await queue.enqueue("research.scan", {});
        await queue.drain();
      } finally {
        busy = false;
      }
    }, env.SCAN_INTERVAL_MS);
    stops.push(async () => clearInterval(timer));
  }

  const server = createServer((req, res) => {
    const ok = req.url === "/health";
    res.writeHead(ok ? 200 : 404, { "content-type": "application/json" });
    res.end(JSON.stringify(ok ? { ok: true } : { error: "not found" }));
  }).listen(env.PORT);
  logger.info("worker.started", { queue: env.WORKER_QUEUE, port: env.PORT });

  // The platform sends SIGTERM before it stops the container: finish running jobs first.
  async function shutdown() {
    logger.info("worker.stopping", {});
    for (const stop of stops) await stop();
    server.close();
    await database.pool.end();
    process.exit(0);
  }
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((error) => {
  logger.error("worker.failed", { error });
  process.exit(1);
});
