# Starter Audit

日期：2026-10-10。对象：从 saas-starter 创建的本仓库 `main`（`02b778f`）。方法：只读代码和文档，不修改代码，不调用付费 API。

按 [Termrise 工程实施方案](termrise.md) 逐项核对 Starter 的真实实现，结果分为：

- **已实现**：Termrise 可以直接复用。
- **部分实现**：有接口或骨架，需要补充。
- **缺失**：需要新增。
- **接口与风险**：复用时要遵守的接口、已知限制和文档冲突。

路径相对于仓库根目录。

## Summary

| 领域               | 状态     | 结论                                                                                   |
| ------------------ | -------- | -------------------------------------------------------------------------------------- |
| Monorepo           | 已实现   | pnpm workspace + Turborepo；包边界由 ESLint 和 `package-graph.test.ts` 检查            |
| Next.js / API 约定 | 已实现   | Next.js 16.3.8；`userRoute()` 统一鉴权、限流和错误格式；`userRoute` 不支持动态路由参数 |
| DB / Drizzle       | 部分实现 | 基础表与测试库工具齐全；没有任何 Termrise 业务表                                       |
| Auth               | 已实现   | Better Auth（Magic Link、Google）；`requireUser`；Postgres 固定窗口限流                |
| AI Provider        | 部分实现 | DeepSeek 适配器只有文本输入输出；没有结构化输出、Zod 校验、用量和成本记录              |
| Jobs / Worker      | 部分实现 | 只有队列接口和内存适配器；Worker 启动即退出；**没有 BullMQ / Redis**                   |
| 定时任务           | 缺失     | 没有 Cron；`api.md` 明确不使用 Cron API                                                |
| Analytics          | 已实现   | PostHog 同意后加载；服务端事件过滤 `email` / `prompt`；事件名是封闭联合类型            |
| Observability      | 部分实现 | JSON 日志、`AppError`、Sentry；脱敏只按顶层字段名匹配                                  |
| SEO                | 已实现   | sitemap、JSON-LD、IndexNow、关键词矩阵（只用于营销站自身，不是产品功能）               |
| Waffo / Credits    | 已实现   | 完整可用；Termrise 暂不使用，但注册仍发 Credits，收费路由仍开放                        |
| Storage            | 已实现   | R2 + Fake 适配器、预签名上传；可用于 Brief 导出等文件                                  |
| 测试               | 已实现   | Vitest unit 53 / integration 16，Playwright E2E 19；支持已登录流程                     |
| CI                 | 已实现   | lint / format / typecheck / test / build / e2e / PR title；CI 没有付费 API 的 Secret   |
| 部署               | 部分实现 | 只部署 `apps/web` 到 Vercel；`apps/worker` 没有部署目标                                |
| Termrise 业务模块  | 缺失     | 研究项目、热词、关键词、SERP、机会、预算、执行与收入：表、Service、API、页面都不存在   |

---

## Monorepo

**已实现**

- `pnpm-workspace.yaml`：`apps/*`（web、api、worker）+ `packages/*`（ai、analytics、auth、billing、config、credits、db、jobs、observability、seo、storage、ui）。
- `turbo.json`：`build`、`typecheck`、`dev`。包以源码导出（`exports: "./*": "./src/*.ts"`），不需要预构建。
- 包规则由 `eslint.config.mjs`、`eslint-boundaries.test.ts`、`package-graph.test.ts` 检查，见 [Monorepo](overview.md#monorepo)。

**接口与风险**

- termrise.md 列出的 `packages/trend-discovery` 等业务包都不存在。按 [Monorepo](overview.md#monorepo) 的规则，业务代码先放 `apps/web/src/features/<name>/`；Worker 需要同一规则时再移到 `packages/*`（与 [jobs.md](jobs.md) 对 TaskService 的要求相同）。
- 根 `package.json` 的 `name` 和 `docker-compose.yml` 的 `name` 仍为 `saas-starter`。

## Next.js and API

**已实现**

- Next.js 16.3.8、React 19.2.8、next-intl 4。Route group：`(auth)`、`(dashboard)`（`/dashboard`、`/billing`）、`(marketing)`、`admin/`。
- Locale 来自 `NEXT_LOCALE` cookie → Accept-Language → `en`，URL 没有 locale 前缀；文案在 `apps/web/messages/{en,zh}.json`。
- `apps/web/src/server/http/route.ts`：`userRoute({ rateLimit }, handler)` 负责请求上下文、`requireUser`、按用户限流和 `errorResponse`。错误格式 `{ error: { code, message } }`，见 [api.md](api.md)。
- 目录约定：可替换的产品功能放 `features/<name>/`，平台能力放 `server/<domain>/`。

**接口与风险**

- `userRoute` 的 handler 只收到 `{ request, user }`，没有 Next.js 的 `params`。现在除 `auth/[...all]` 外没有动态 API 路由。`/api/research/:id/...` 需要先扩展 `userRoute`。
- `API_RATE_LIMITS`（`apps/web/src/server/http/rate-limits.ts`）只有 `task`、`upload`、`checkout`。新路由要加自己的限流名。
- `AppError` 的 code 是封闭表（`packages/observability/src/errors.ts`，与 `apps/web/src/lib/api-error.ts` 由测试保持一致）。没有通用的 `NOT_FOUND`，也没有 `BUDGET_EXHAUSTED`。
- `apps/web/src/proxy.ts` 只保护 `/dashboard`、`/billing`（`PROTECTED` 正则）。`/radar`、`/research`、`/opportunities`、`/projects`、`/settings/providers` 要放进 `(dashboard)` 并加入该正则。
- 没有通用的资源归属检查。现有 Service 各自按 `userId` 过滤；其他用户的资源返回 `*_NOT_FOUND`。

## DB and Drizzle

**已实现**

- `packages/db/src/client.ts`：`node-postgres` Pool + `drizzle-orm/node-postgres`，支持交互式事务。
- 表：`user`、`session`、`account`、`verification`（Better Auth），`tasks`，`credit_transactions`，`purchases`，`subscriptions`，`payment_events`，`rate_limits`，`analytics_consents`。
- Migration 4 个（`0000_init` … `0003_subscription_reversal`）；CI 检查 schema 与 migration 不漂移。
- 测试库：每个 worktree 一个库，只允许本地主机，见 [testing.md](testing.md)。

**缺失**

- termrise.md 的全部逻辑表：`research_projects`、`research_runs`、`source_signals`、`trend_terms`、`keywords`、`keyword_metric_snapshots`、`serp_snapshots`、`opportunities`、`api_tasks`、`api_usage`、`budget_reservations`、`ai_runs` 等。

**接口与风险**

- `resetDb()`（`packages/db/src/testing/db.ts`）truncate 的表名是写死的。每个新表都要加进去，否则集成测试互相污染。
- 可复用的幂等模式有三种：`credit_transactions.idempotency_key` + advisory lock；`tasks (user_id, request_id)` 唯一 + `onConflictDoNothing`；`payment_events` 收件箱 + `processed_at` + `FOR UPDATE`。分别适合研究任务的幂等键、`api_tasks` 去重和外部回调去重。

## Auth

**已实现**

- `packages/auth/src/create-auth.ts`：Better Auth + Drizzle adapter；Google、Magic Link（Resend，300 秒，token 哈希）、One Tap。不支持密码登录。
- `requireUser`、`getRequestSession`、`getAdminSession`（`ADMIN_USER_IDS`），见 `apps/web/src/server/auth/auth.ts`。
- 限流：Postgres `rate_limits` 固定窗口计数（`packages/auth/src/rate-limit.ts`），超限抛 `RATE_LIMITED`。

**接口与风险**

- `rate_limits` 的过期行不清理（[security.md](security.md) 已记录）。
- 新用户注册时 `onUserCreated` 发放 `signupBonusCredits`（`product.config.ts` 为 10）。Termrise 不使用 Credits，见 [Waffo and Credits](#waffo-and-credits)。

## AI Provider

**已实现**

- `packages/ai/src/provider.ts`：`AiProvider.run(input: string): Promise<{ output: string }>`。
- `packages/ai/src/adapters/deepseek.ts`：Vercel AI SDK `generateText` + `@ai-sdk/deepseek`；默认 60 秒超时、2048 输出 token；错误中去掉 Prompt 和响应体。另有 `example`、`fake` 适配器。
- 模型名不写死，来自 `DEEPSEEK_MODEL`；只在 `TASK_PROVIDER=deepseek` 时必填。

**缺失**

- 结构化输出：没有 JSON 模式或 schema 输出，`packages/ai` 声明了 `zod` 依赖但没有使用。
- 用量与成本：`result.usage` 被忽略；返回值没有模型、token、prompt 版本。没有 `ai_runs` 表。
- `DEEPSEEK_BASE_URL`：适配器只传 `apiKey`，没有 `baseURL`。

**接口与风险**

- `finishReason = "length"`（输出被截断）也当作成功。结构化输出时截断会导致 Zod 校验失败，要当作错误处理。
- `.env.example` 与 [environment.md](environment.md) 写的模型名（`deepseek-flash`、`deepseek-v4-pro`）没有按 DeepSeek 官方文档核对。termrise.md 要求编码时核对，不得写死。
- `DEEPSEEK_API_KEY` 的必填条件绑定 `TASK_PROVIDER`。Termrise 的 AI 任务不走 TaskService，需要自己的条件（例如 Worker 的 env schema）。

## Jobs and Worker

**已实现**

- `packages/jobs/src/queue.ts`：`JobQueue.enqueue()`（`jobId` 幂等、`maxAttempts` 默认 3）、`JobConsumer.start/stop()`。
- `apps/worker/src/worker.ts`：`handlers` 映射 + `startWorker(consumer)`；`worker.test.ts` 用内存队列测试。

**部分实现**

- 唯一的适配器是内存队列（`packages/jobs/src/adapters/memory.ts`）：重试立即重新入队，没有退避、延迟、定时、取消、进度和 checkpoint。
- `apps/worker/src/index.ts` 写一条 warn 日志后 `process.exit(1)`。唯一的任务类型是 `example.echo`。
- `apps/api`（Hono）只有 `/health`，不部署。

**缺失**

- **BullMQ、Redis、ioredis**：依赖、`docker-compose.yml`、env、代码中都没有。
- 定时调度：没有 Cron；`apps/web/vercel.json` 没有 `crons`。
- Worker 的 env schema（[jobs.md](jobs.md) 建议的 `workerEnv()`）、SIGTERM 处理、部署配置（Dockerfile 或平台配置）。
- termrise.md 的队列 `trend.ingest`、`keyword.expand`、`keyword.enrich`、`serp.audit`、`opportunity.analyze`、`blueprint.generate`，以及多阶段研究状态机。

**接口与风险**

- termrise.md 写「优先复用 Starter 的 BullMQ/Redis」，PRD 写「复用 Starter 的 Jobs/Redis」。Starter 没有这两项，见 [Doc Conflicts](#doc-conflicts)。
- TaskService（`apps/web/src/features/tasks/task-service.ts`）是同步、单阶段、与 Credits 绑定的状态机，不适合研究任务。可以复用的是它的模式：条件更新（`WHERE status = 'PENDING'`）、幂等 `requestId`、失败与退款在同一事务中。

## Analytics

**已实现**

- `packages/analytics`：客户端 PostHog 只在用户同意后懒加载；服务端事件先查同意状态，丢弃 `email`、`prompt` 属性，失败不抛错。Vercel Web Analytics 另外启用。

**接口与风险**

- 事件名是封闭联合类型（`packages/analytics/src/types.ts`）。研究相关事件要先加类型，见 [observability.md](observability.md)。
- 事件用 `product_id`（`product.config.ts` 的 `id`）区分产品，现在是 `acme`。

## Observability

**已实现**

- `packages/observability/src/logger.ts`：JSON 日志、`AsyncLocalStorage` 传递 `requestId`、按字段名脱敏、error 日志转发 Sentry；去掉 Drizzle 的 `params:`。

**接口与风险**

- 脱敏只匹配**顶层**字段名，且名单固定。嵌套对象和 `login`、`api_key`、`accessToken` 等字段名不会被脱敏。
- Error 的 `message` 和 `stack` 不脱敏。DataForSEO 使用 Basic Auth；如果客户端错误中带请求头，凭据会进入日志和 Sentry。DataForSEO 客户端必须自己清理错误，并加测试。
- Worker 没有接入 Sentry。

## SEO

**已实现**

- `packages/seo`：sitemap、JSON-LD、IndexNow、关键词矩阵校验（`pnpm seo:validate`）。`.claude/skills/seo-keyword-matrix` 管理营销站自身的关键词。

**接口与风险**

- `seo/` 中的数据仍是 Starter 的 Credits 示例。
- 该 Skill 的打分和聚类脚本只服务营销站，不是 Termrise 的产品功能。产品的关键词聚类和评分（M2、M3）要在业务代码中重新实现，不依赖 Skill 脚本。

## Waffo and Credits

**已实现**

- CreditService（`packages/credits/src/credit-service.ts`）：`grant`、`reverse`、`debit`、`refund`、`adminAdjust` 等；用户行锁 + 幂等键 advisory lock + 条件更新，见 [CreditService](data-model.md#creditservice)。
- Billing：Waffo 与 Fake 适配器、Checkout、webhook 收件箱、Credit Pack、订阅，见 [billing.md](billing.md)。

**接口与风险**

- Termrise 暂不使用 Waffo 与 Credits（PRD：「Waffo/Credits 暂不用于 Termrise 自身对外收费」）。但现在：
  - 每个新用户获得 10 Credits；
  - `/billing`、`/api/checkout`、`/api/billing/*`、Waffo webhook 仍开放；
  - `PAYMENT_PROVIDER` 必填，Production 必须为 `waffo`，所以部署 Production 仍需要 Waffo Key。
- CreditService 不能作为 API 预算账本：余额在 `user.credit_balance`，金额是整数 Credits，类型是封闭枚举，`refund` 只能全额退回。termrise.md 要求「预留 → 按实际 cost 结算 → 释放差额」，需要独立的 `budget_reservations`。可以复用的是锁顺序、幂等键和条件更新的模式；金额建议用整数（例如 micro-USD），保持整数加 CHECK 的风格。

## Storage

**已实现**

- `packages/storage`：`ObjectStorage` 接口；R2 适配器（预签名 PUT/GET、head、get、流式 put、delete、分页 list）；Fake 适配器；本地 SeaweedFS，见 [storage.md](storage.md)。

**接口与风险**

- P0 的 CSV 导入和 Markdown 导出可以不经过 R2（请求体上传、响应下载）。需要保存文件时再用 Storage。

## Testing and CI

**已实现**

- Vitest 两个 project：`unit`（53 个文件，含 Skill 脚本的 5 个 `.test.mjs`）、`integration`（16 个 `*.int.test.ts`，真实 PostgreSQL）。
- Playwright：桌面 + Pixel 7，用 `next start`（端口 3100）和 Fake Provider；19 个 spec。`apps/web/tests/setup/sign-in.ts` 创建真实 Magic Link 会话，支持已登录流程。
- CI（`.github/workflows/ci.yml`）：依赖审计、migration 漂移检查、lint、format、typecheck、test、build、e2e。CI 只用 `TEST_DATABASE_URL` 和占位值，没有能调用付费 API 的 Secret。

**缺失**

- termrise.md 的 `live-smoke` 手动 workflow；[testing.md](testing.md) 也写明 Production 冒烟测试未定义。
- 研究流程的 E2E（创建 → 导入 → 运行 fixture → 机会 → 决策 → 导出 → 结果）。

**接口与风险**

- E2E 中的品牌断言写死 `Acme`（例如 `dashboard.spec.ts`、`sign-in.ts` 的 `appName`）。改品牌时要同步修改。

## Deployment

**已实现**

- Vercel，Root 为 `apps/web`，只在 `main` 自动部署（`apps/web/vercel.json`）；Preview 构建前执行 migration（`apps/web/scripts/vercel-build.mjs`）。见 [deployment.md](deployment.md)。

**缺失**

- 常驻 Worker 的部署平台。Vercel 不运行常驻进程；[deployment.md](deployment.md) 写明 `apps/api`、`apps/worker` 不部署。`infra/` 只有 R2 CORS 配置。
- Redis 的托管服务。

## Environment

`packages/config/src/env.ts` 的 `serverEnv()` 始终要求：`APP_URL`、`DATABASE_URL`、`BETTER_AUTH_SECRET`、`BETTER_AUTH_URL`、`GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET`、`RESEND_API_KEY`、`EMAIL_FROM`、`R2_*`（4 个）、`PAYMENT_PROVIDER`、`SENTRY_DSN`。完整列表见 [environment.md](environment.md)。

与 termrise.md 拟新增变量的对照：

| 变量                                           | 现状                                                   |
| ---------------------------------------------- | ------------------------------------------------------ |
| `DEEPSEEK_API_KEY`                             | 已存在，同名；只在 `TASK_PROVIDER=deepseek` 时必填     |
| `DEEPSEEK_MODEL`                               | 已存在，termrise.md 没有列出；模型名必须来自它，不写死 |
| `DEEPSEEK_BASE_URL`                            | 缺失；适配器不支持 `baseURL`                           |
| `DATAFORSEO_LOGIN`、`DATAFORSEO_PASSWORD`      | 缺失                                                   |
| `RESEARCH_*`（5 个）                           | 缺失                                                   |
| `GOOGLE_TRENDS_ENABLED`、`HACKER_NEWS_ENABLED` | 缺失                                                   |
| `REDIS_URL`                                    | 缺失（只有选定 BullMQ 时需要）                         |

Worker 如果调用 `serverEnv()`，就要提供 Google、Resend、R2、Waffo 等 web 专用变量。按 [jobs.md](jobs.md)，Worker 要有自己的 schema。

## Doc Conflicts

下面的冲突需要维护者确认后再实施。本审计不修改这些文档的语义。

2026-10-10 的决定：1、2 见 `docs/adr/011-worker.md`（BullMQ + Upstash Redis，Worker 部署在 Cloudflare Containers，web 只写数据库状态，定时采集由 Worker 调度）；3 为保留代码、隐藏入口；4 为不新增 `DEEPSEEK_BASE_URL`。另外决定全部 API 迁到 `apps/api`（Cloudflare Workers），`apps/web` 只经 HTTP 调用，见 `docs/adr/012-api-modular-monolith.md`；下面的 Follow-up Slices 顺序以 ADR-012 的迁移顺序为准。

1. **Jobs/Redis**：termrise.md「优先复用 Starter 的 BullMQ/Redis」、PRD「复用 Starter 的 Jobs/Redis」。实际：Starter 没有 BullMQ 和 Redis，只有接口和内存适配器（[jobs.md](jobs.md) 的描述与代码一致）。需要决定：队列方案（BullMQ + Redis、Postgres 队列或托管队列）和 Worker 部署平台。
2. **定时采集**：PRD F01 要求「每日采集」。[api.md](api.md) 写「不使用 Cron API」。需要决定：定时触发由 Worker 调度、Vercel Cron 还是外部触发。
3. **Waffo 与 Credits**：PRD 写暂不使用。实际：注册仍发 Credits，收费页面和路由仍开放，Production 仍要求 Waffo Key。需要决定：保留、隐藏，还是关闭。
4. **`DEEPSEEK_BASE_URL` 与 `DEEPSEEK_MODEL`**：termrise.md 拟新增前者，没有提后者；代码只有后者。需要决定：是否新增 `DEEPSEEK_BASE_URL`。
5. **品牌**：`AGENTS.md` 已改为 Termrise；`product.config.ts`（`acme` / `Acme`）、`messages/*.json`、`public/llms.txt`、README、E2E 断言、[overview.md](overview.md) 仍为 Acme / saas-starter。

## Follow-up Slices

按 termrise.md 的 Task 顺序，加上 Starter 缺失的前置项。编号在开始时写入 Slice Plan。

| 建议 Slice | 对应 Task | 内容                                                                                                                                                     | 依赖           |
| ---------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| S02        | M0-02     | 回答 [Doc Conflicts](#doc-conflicts)，写入 Confirmed Decisions / ADR；更新 PRD、termrise.md 的冲突描述                                                   | S01            |
| S03        | —         | 品牌改为 Termrise（`product.config.ts`、文案、E2E 断言、README）；按 S02 处理 Credits 与收费入口                                                         | S02            |
| S04        | M1-01     | Research Project schema + CRUD + `/research` 页面；`userRoute` 支持动态参数、`research` 限流、错误码、`proxy.ts` 保护                                    | S02            |
| S05        | M1-02     | API Budget Ledger：`budget_reservations` 预留 / 结算 / 释放，并发集成测试                                                                                | S04            |
| S06        | M1-03     | HN Adapter + CSV Import：`source_signals` 去重与幂等，fixture 测试                                                                                       | S04            |
| S07        | M1-04     | Google Trends Adapter：可用导出方式按官方说明核对，不可用时回退 CSV                                                                                      | S06            |
| S08        | —         | 持久队列适配器 + `workerEnv()` + Worker 部署与 SIGTERM；按 S02 的队列决定                                                                                | S02            |
| S09        | M1-05     | Scheduler / Worker 任务 + Radar UI                                                                                                                       | S06、S07、S08  |
| 后续       | M2–M5     | DataForSEO Client（含错误脱敏）、扩词、指标、SERP；AI 结构化输出端口（Zod、用量、成本、`ai_runs`）；评分；验证、Brief、执行与收入；`live-smoke` workflow | 按 termrise.md |
