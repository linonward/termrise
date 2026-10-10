# Background Jobs

Starter 的后台任务只有骨架：`packages/jobs` 定义队列接口，`apps/worker` 定义处理器。没有持久化队列，没有部署配置。产品需要后台任务时，按本文加上。

现在的付费操作是同步的（[tasks.md](tasks.md)）。只有一次请求做不完的工作才需要后台任务，例如长时间的 AI 生成、批量处理、定时清理。

---

## Queue

`packages/jobs/src/`：

| 文件                 | 作用                                                                             |
| -------------------- | -------------------------------------------------------------------------------- |
| `job-types.ts`       | `JobPayloads`：每个任务名和它的 payload 类型。新任务加在这里                     |
| `queue.ts`           | `JobQueue.enqueue()`（生产方）、`JobConsumer.start/stop()`（消费方）、`Job` 类型 |
| `adapters/memory.ts` | 进程内存队列，只用于测试和本地运行；重启后任务丢失                               |

规则：

- payload 只放 JSON 和 ID，不放 Secret、完整 Prompt、Email。处理器按 ID 从数据库读取需要的数据。
- `enqueue()` 的 `jobId` 相同时只加一次，当作幂等键。例如用 `task:{id}` 保证一个 Task 只入队一次。
- 默认最多运行 3 次（`maxAttempts`）。处理器必须幂等：同一个任务可能在崩溃或重试后再次运行。
- 涉及 Credits 的处理器仍只经 CreditService 修改余额；失败时的退款与同步路径相同（[Refund](tasks.md#refund)）。

---

## Worker

`apps/worker/src/`：

- `worker.ts`：`createHandlers()` 把任务名映射到处理器；`startWorker(consumer, handlers)` 开始消费。
- `processors/example.processor.ts`：示例处理器，只写一条日志。
- `index.ts`：入口，见下文 [Termrise](#termrise)。

`worker.test.ts` 用内存队列验证入队、处理和日志。

---

## Add a Durable Queue

1. 选择队列：例如 BullMQ（需要 Redis）或托管队列。不要猜 SDK 的 API，先读官方文档或安装包里的类型。
2. 在 `packages/jobs/src/adapters/` 实现 `JobQueue` 和 `JobConsumer`，用与 `memory.test.ts` 相同的场景测试：只加一次、重试、最终失败。
3. 连接信息（例如 `REDIS_URL`）加到 `packages/config/src/env.ts` 和 `.env.example`。Worker 不调用 `serverEnv()`：它要求 web 的全部变量（Google OAuth、Resend、R2 等）。在 `env.ts` 中为 Worker 另外定义只含所需变量的 schema（例如 `workerEnv()`：`DATABASE_URL`、`REDIS_URL` 和处理器用到的 Provider Key），web 的 schema 不变。
4. 在 `apps/worker/src/index.ts` 创建适配器并调用 `startWorker()`；收到 SIGTERM 时调用返回的 stop 函数。
5. 选择 Worker 的部署平台（Vercel 不运行常驻进程）。部署方式记录在 [deployment.md](deployment.md)。
6. 在 web 的 Service 里用 `JobQueue.enqueue()` 替代同步调用，并把 Task 状态机改为异步，见 [Sync vs Async](tasks.md#sync-vs-async)。

### Termrise

Termrise 的选择（`docs/adr/011-worker.md`）与上面的步骤有两处不同：

- BullMQ 适配器在 `apps/worker` 中实现，不放 `packages/jobs`。`packages/jobs` 的接口和内存适配器保留，用于测试处理器。
- HTTP API（`apps/api`，`docs/adr/012-api-modular-monolith.md`）不调用 `JobQueue.enqueue()`，不连接 Redis，只写数据库状态（例如 `research_runs.status = pending`）；Worker 用 BullMQ Job Scheduler 定时扫描并入队，定时采集也由 Job Scheduler 触发。

Redis 用 Upstash（TCP + TLS，`rediss://`）；本地用 `docker compose up -d redis`。Worker 部署见 [Worker](deployment.md#worker)。

现在的实现：

- 任务：`research.scan`（Job Scheduler 每 `SCAN_INTERVAL_MS` 一次）找出 `pending` 的研究运行，为每个运行入队一个 `research.run`（`jobId` 为 `research-run-{runId}`，只加一次）；`research.run` 调用 `packages/research` 的 `execute(runId)`。`execute` 用一个条件更新把运行从 `pending` 改为 `running`，第二个 Worker 或重试拿不到同一个运行。
- `apps/worker/src/bullmq.ts`：BullMQ 适配器（`Queue.add`、`upsertJobScheduler`、`Worker`，并发 2；ioredis 连接设置 `maxRetriesPerRequest: null`）。
- `apps/worker/src/index.ts`：读取 env、创建数据库和 runner、启动消费与定时扫描、提供 `GET /health`；收到 SIGTERM 时停止消费、关闭连接后退出。
- 还没有处理中途崩溃留下的 `running` 运行（需要超时恢复），也还没有部署到 Cloudflare Containers。

TaskService 在 `packages/tasks`。Worker 的处理器需要修改 Task 状态（调用 Provider、转为终态、退款）时，调用同一个 TaskService：Worker 不能 import `apps/*`，也不得复制 Task 规则（overview.md 的 Monorepo 规则：业务规则只实现一次）。
