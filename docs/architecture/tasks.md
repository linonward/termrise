# Paid Action (Tasks)

## Overview

`apps/web/src/features/tasks/` 是 starter 的示例付费操作：用户提交一段文本，花 1 Credit，得到结果。它演示每个按次收费功能都需要的规则：先扣费，再调用 Provider，失败时退款，重试不重复扣费。

新产品用自己的功能（例如调用 AI 模型生成内容）替换示例，保留这些规则。

| 文件                                   | 作用                                                                                                                                                                                                                                                                                               |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/ai/src/provider.ts`          | `AiProvider` 接口：`run(input) → { output }`                                                                                                                                                                                                                                                       |
| `packages/ai/src/adapters/example.ts`  | 示例 Provider：反转文本。没有第三方依赖，Production 可以运行                                                                                                                                                                                                                                       |
| `packages/ai/src/adapters/deepseek.ts` | DeepSeek Provider：经 AI SDK（`@ai-sdk/deepseek`）调用，返回回答文本。默认总超时 60 秒（含重试）；每次回答最多 2048 个输出 token（`maxOutputTokens`）。回答达到上限被截断时（`finishReason` 为 `length`），返回截断的文本，Task 成功，不退款：Provider 已按 token 收费，退款会让用户免费消耗 token |
| `packages/ai/src/adapters/fake.ts`     | 测试 Provider：输出大写文本；输入含 `[fail]` 时抛错，用来测退款                                                                                                                                                                                                                                    |
| `features/tasks/task-service.ts`       | `run()`、`list()`、`failStaleTasks()`；唯一修改 Task 状态的地方                                                                                                                                                                                                                                    |
| `features/tasks/credit-cost.ts`        | `TASK_CREDIT_COST = 1`；定价页经 `server/product.ts` 的 `CREDIT_COST_PER_USE` 用它计算次数和单价                                                                                                                                                                                                   |
| `features/tasks/tasks.ts`              | 按 `TASK_PROVIDER` 组装 Service；`toTaskDto()` 输出公开字段                                                                                                                                                                                                                                        |

UI：`/dashboard` 的 `TaskPanel`（`apps/web/src/features/tasks/task-panel.tsx`）：输入框、运行按钮（显示花费 1 Credit）和结果列表。

表结构见 [Tasks](data-model.md#tasks)。

---

## Flow

```text
POST /api/tasks { requestId, input }
↓
requireUser()
↓
rate limit：task:{userId}，10 次 / 60 秒
↓
TaskService.run()
↓
校验：requestId 为 UUID；input 去掉首尾空白后 1–500 字符
↓
BEGIN
  INSERT task（PENDING，credits_cost = TASK_CREDIT_COST）
    ON CONFLICT (user_id, request_id) DO NOTHING
  CreditService.debit()  → TASK_DEBIT，金额 = credits_cost
COMMIT
↓
AiProvider.run(input)（同步调用）
├── 成功 → UPDATE task SET status = SUCCEEDED, output, completed_at
│          → task_succeeded
└── 抛错 → 日志 task.failed，→ task_failed
           → BEGIN
               UPDATE task SET status = FAILED, error_code = PROVIDER_ERROR, completed_at
               CreditService.refund() → TASK_REFUND，金额取自 TASK_DEBIT
             COMMIT
↓
201 + Task DTO
```

- 余额不足时整个事务回滚，不留下 Task 记录，返回 `402 INSUFFICIENT_CREDITS`。扣费的规则见 [Credit Invariants](data-model.md#credit-invariants) 和 [CreditService](data-model.md#creditservice)。
- Provider 失败不是 HTTP 错误：接口仍返回 `201`，Task 的 `status` 为 `FAILED`，`errorCode` 为 `PROVIDER_ERROR`，Credits 已退回。
- 输入不合法返回 `400 INVALID_INPUT`；超过限流返回 `429 RATE_LIMITED`（带 `Retry-After`）；未登录返回 `401 UNAUTHORIZED`。错误格式见 [Error Contract](api.md#error-contract)，限流实现见 [Rate Limiting](security.md#rate-limiting)。
- Provider 的错误信息只写日志（`task.failed`），不返回给用户，也不写入 Task。
- `GET /api/tasks` 先执行 [Stale Tasks](#stale-tasks) 清理，再返回当前用户最近 20 条 Task，新的在前。DTO 不含 `requestId`。

---

## Status Rules

```text
PENDING → SUCCEEDED
PENDING → FAILED
```

- 只有 TaskService 修改 Task 状态。Route Handler、页面和脚本不得直接 `UPDATE tasks`。
- 每次转换都用条件更新：`WHERE id = :id AND status = 'PENDING'`。终态不再改变。
- 只有 FAILED 的 Task 可以退款；退款金额取自扣费 Ledger。

---

## Idempotency

`requestId` 是客户端生成的 UUID，代表“一次操作”。`TaskPanel` 每次提交生成一个新的 `requestId`，不自动重试；如果客户端要自动重试网络错误，必须复用同一个 `requestId`。

- `(user_id, request_id)` 唯一约束：同一个 `requestId` 的第二次请求不插入新记录，不扣费，直接返回第一次的 Task。两个并发请求同样只扣一次。
- 第一次请求还在执行时，重试拿到的 Task 可能仍为 `PENDING`。
- Ledger 幂等键：

```text
task:{taskId}:debit
task:{taskId}:refund
```

重复调用 `debit()` / `refund()` 返回已有记录，不重复改余额。

---

## Refund

退款条件：

| 情况                                    | `error_code`     |
| --------------------------------------- | ---------------- |
| `AiProvider.run()` 抛出错误             | `PROVIDER_ERROR` |
| Task 超过 15 分钟仍为 PENDING（见下文） | `TIMEOUT`        |

两条路径共用私有方法 `fail()`：在一个事务内把 Task 从 PENDING 改为 FAILED，只有这次更新成功时才调用 `refund()`。所以不会出现“已失败但没退款”的记录，也不会重复退款（`refund()` 本身也是幂等的）。Task 的状态规则（PENDING 才扣费、FAILED 才退款）只在 TaskService 中，CreditService 不读取 `tasks`。

---

## Stale Tasks

进程可能在扣费之后、写入终态之前中断（例如函数超时），Task 会停在 `PENDING`。`TaskService.failStaleTasks(userId)` 处理这种记录：

- 创建超过 `STALE_TASK_MS`（15 分钟，`apps/web/src/features/tasks/task-service.ts`）仍为 PENDING 的 Task，改为 FAILED，`error_code = TIMEOUT`，同一事务内退款。每条记一次 warn 日志 `task.stale`。
- 不使用 Cron，在读取时执行：已登录页面（`/dashboard`、`/billing`）读取余额用 `balanceForUser()`（`apps/web/src/server/credits/credits.ts`），它先经 `server/product.ts` 的 `beforeBalanceRead` 调用 `failStaleTasks`，再读余额，并按请求缓存。layout 和 page 同时渲染，无论哪个先读，拿到的都是退款后的余额；页面在它之后再读 Task 列表和流水。`GET /api/tasks` 在列出 Task 之前调用。用户看到的余额和列表因此已包含退款（E2E：`dashboard.spec.ts`）。
- 只处理当前用户的 Task。
- 如果 Provider 在超时之后才返回，Task 已不是 PENDING，条件更新 0 行，结果被丢弃，不发送 `task_succeeded`，不重复退款；请求返回已失败的 Task。Provider 在超时之后才抛错时同样返回已失败的 Task。

接入慢的 Provider 时，`STALE_TASK_MS` 必须大于 Provider 的最长耗时；长任务按 [Sync vs Async](#sync-vs-async) 改为异步。

---

## Replace the Example

1. 在 `packages/ai/src/adapters/` 实现自己的 `AiProvider`（或改名为产品的领域名，例如 `GenerationProvider`），在 `tasks.ts` 中替换 `createExampleAiProvider()`。Provider 的密钥只在服务端读取，加到 `packages/config/src/env.ts` 和 `.env.example`。
2. 改 `TASK_PROVIDER` 的取值：保留 `fake` 给测试，去掉 `example`。Production 仍禁止 `fake`。
3. 改 `TASK_CREDIT_COST`，或按输入计算价格。价格只在服务端决定，并保存在记录的 `credits_cost` 中。
4. 需要新字段时，改 `tasks` 表（`packages/db/src/schema/tasks.ts`）并生成 migration。要改表名时，同时改 `credit_transactions.task_id`、Ledger 类型（`TASK_DEBIT` / `TASK_REFUND`）和 TaskService 中的幂等键前缀；`packages/credits` 不需要修改。Dashboard 和管理台通过 `TaskService.list()` 读取记录（管理台经 `server/product.ts` 的 `listPaidRecords` 传给 `createAdminService` 的 `listTasks` 参数），不直接查表。替换 Feature 后，改 `server/product.ts` 中的三个导出，平台代码不需要修改。
5. 需要上传文件时，在扣费之前调用 `UploadService.verifyUpload()`，见 [Upload Flow](storage.md#upload-flow)。
6. 改 Analytics 事件名（`task_started`、`task_succeeded`、`task_failed`），见 [Analytics](observability.md#analytics)。
7. 改 `TaskPanel` 和 `apps/web/messages/{en,zh}.json` 中的文案。
8. 保留 `task-service.int.test.ts` 中的场景：扣费、重试只扣一次、失败退款、余额不足时不留下记录、并发时最后 1 个 Credit 只扣一次、只列出自己的记录。
9. TaskService 是示例业务代码，留在 `apps/web/src/features/tasks/`，不放进 `packages/*`。产品启用 `apps/worker` 处理自己的任务时，把产品的 Service 移到 `packages/<domain>`，web 和 worker 调用同一个包。

生成 AI 内容的产品，在申请 Waffo 的 AIGC 审核之前，还要加内容审核（Prompt 和结果检查、屏蔽词表、审核记录）。starter 没有这部分；可以参考 ClipSKU 的 moderation 模块。

---

## Sync vs Async

示例在一个请求内同步调用 Provider。这只适合在函数时长上限内一定能完成的操作。

AI 视频、图片等长任务通常要几十秒到几分钟，必须改为异步：

```text
创建记录 + 扣费（一个事务）
↓
提交 Provider 任务，保存 provider_job_id
↓
立即返回 PENDING / QUEUED，前端轮询状态
↓
Provider webhook（验签）→ Service 转为终态
↓
兜底：读取时同步（没有 Cron）——读取记录时，对超过一定时间仍未终态的任务向 Provider 查询
↓
超时 → FAILED + 退款（同一事务）
```

设计要点：

- 状态机更多：例如 `PENDING → QUEUED → PROCESSING → SUCCEEDED | FAILED`。每次转换仍是条件更新，webhook 和同步并发时更新 0 行即忽略。
- Webhook 路由读原始 body 验签，与支付 webhook 一样做幂等。
- Provider 的结果 URL 通常会过期：先复制到自己的存储，复制成功才进入 SUCCEEDED。
- 超时和复制失败都要退款。

starter 从 ClipSKU（AI 商品视频 SaaS）提取而来。ClipSKU 的 Generation 模块是这种设计的参考实现：fal webhook + 读取时同步、30 分钟超时退款、结果复制到 R2。它的代码和文档不在本仓库中。
