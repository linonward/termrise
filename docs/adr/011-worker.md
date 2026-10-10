# ADR-011: Worker on Cloudflare Containers with BullMQ

- Status: Accepted
- Date: 2026-10-10

## Context

Termrise 需要常驻 Worker 处理定时采集、批量扩词、SERP 和 AI 分析（[termrise.md](../architecture/termrise.md)）。S01 审计（[starter-audit.md](../architecture/starter-audit.md)）发现：Starter 没有 BullMQ 和 Redis，只有 `@repo/jobs` 的队列接口和内存适配器；`apps/worker` 启动后立即退出，没有部署目标。Vercel 不运行常驻进程。

[ADR-001](001-nextjs-monolith.md) 与 [ADR-008](008-monorepo.md) 规定只部署 `apps/web`。本 ADR 为 Termrise 增加第二个部署单元 `apps/worker`。

## Decision

- **队列**：BullMQ + Redis。BullMQ 依赖只在 `apps/worker` 中；Queue、Worker、Job Scheduler 都在 `apps/worker` 中创建。
- **Redis**：Upstash Redis，经 TCP + TLS 连接（`rediss://`）。BullMQ 在队列空闲时也会访问 Redis，Upstash 官方文档建议 BullMQ 使用 Fixed 套餐，不用按请求计费。
- **部署**：Cloudflare Containers（需要 Workers Paid）。Cloudflare Worker + Durable Object 负责启动容器；容器内运行 `apps/worker` 的 Node 进程。普通 Cloudflare Worker 不能运行 BullMQ（需要常驻进程和 TCP 连接）。
- **web 与 Worker 的交接：数据库状态驱动**。`apps/web` 不连接 Redis，不入队。web 只写数据库（例如 `research_runs.status = pending`）并返回 run ID；Worker 用 BullMQ Job Scheduler 定时扫描待处理的记录并入队，按阶段推进状态。定时采集也由 Worker 的 Job Scheduler 触发，web 不使用 Cron API。
- **业务规则只实现一次**：web 与 Worker 都要用的 Service（研究项目、预算、状态机）放在 `packages/*`，按 [Monorepo](../architecture/overview.md#monorepo) 的规则。Worker 不 import `apps/web`。
- **Worker 的 env**：Worker 不调用 `serverEnv()`，使用只含所需变量的 schema（`DATABASE_URL`、`REDIS_URL`、Provider Key 等），见 [jobs.md](../architecture/jobs.md)。
- **容器生命周期**：容器可能随时被停止（空闲超时、主机重启、OOM、发布），平台先发 SIGTERM，最多等 15 分钟再 SIGKILL；磁盘是临时的。Worker 必须处理 SIGTERM（停止取任务、等待进行中的任务）；任务状态只存在 PostgreSQL 和 Redis 中；处理器必须幂等。保持容器运行的方式（`sleepAfter`、Cron Trigger 唤醒等）在实现 Slice 中按 Cloudflare 官方文档确定，不猜测。

## Alternatives

- **共享 BullMQ 适配器（放在 `packages/jobs`，web 直接入队）**：任务启动延迟最低，但 web 也要连接 Redis，Vercel 函数每次请求建立 TCP 连接。
- **Worker 暴露 HTTP 入队接口**：bullmq 只在 Worker 一侧，但多一个公网接口和共享密钥。
- **Postgres 队列（不用 Redis）**：少一个服务，但不是维护者选择的方案。
- **Railway / Render / VPS**：termrise.md 原方案。常驻进程更简单，但维护者选择 Cloudflare。
- **Upstash QStash / Cloudflare Queues**：适合无服务器，但不是 BullMQ，需要改写任务模型。

## Consequences

- web 发起的任务有调度延迟，等于 Worker 的扫描间隔。UI 显示「排队中」状态。
- `@repo/jobs` 的接口和内存适配器保留，用于测试处理器；BullMQ 适配器在 `apps/worker` 中实现并按 [jobs.md](../architecture/jobs.md) 的场景测试（只加一次、重试、最终失败）。
- 新增固定成本：Cloudflare Workers Paid、Containers 用量、Upstash Fixed 套餐。
- 部署文档增加 Worker 一节；CI 不连接 Upstash，测试使用本地 Redis 或内存适配器（在实现 Slice 中确定）。
