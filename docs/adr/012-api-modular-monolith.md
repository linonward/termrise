# ADR-012: API in apps/api, Modular Monolith on Cloudflare

- Status: Accepted
- Date: 2026-10-10
- Supersedes: [ADR-001](001-nextjs-monolith.md) 中「API 和 webhook 用 Route Handlers、只部署 Next.js」的部分

## Context

Starter 按 [ADR-001](001-nextjs-monolith.md) 把页面、API、webhook 都放在 `apps/web`（Next.js，Vercel）。`apps/api`（Hono）只是骨架。Termrise 有常驻 Worker（[ADR-011](011-worker.md)），Worker 与 HTTP 入口要调用同一组业务模块；维护者希望 API 与 UI 分开，后端统一部署在 Cloudflare。

## Decision

- **模块化单体**：业务模块（研究项目、热词、关键词、机会、预算、认证、计费等）在 `packages/*` 中只实现一次，按模块划分边界。有两个入口，分开部署：
  - `apps/api`（Hono）：全部 HTTP API，部署在 **Cloudflare Workers**。
  - `apps/worker`（BullMQ）：后台任务，部署在 **Cloudflare Containers**，见 [ADR-011](011-worker.md)。
- **`apps/web` 不实现 API**：没有 Route Handler，没有写数据的 Server Action。现有的全部路由迁到 `apps/api`：Better Auth（`/api/auth/*`）、Waffo webhook、checkout、billing、tasks、uploads、analytics consent、health。`/admin` 的 Server Action 也改为调用 `apps/api`。
- **`apps/web` 只经 HTTP 读取数据**：Server Component 和客户端都调用 `apps/api`；web 不连接数据库，不依赖 `@repo/db` 和业务 Service。
- **`apps/web` 继续部署在 Vercel**。web 与 api 放在同一个主域名下的子域名（例如 `termrise.com` 与 `api.termrise.com`）。Better Auth 用 `crossSubDomainCookies` 共享会话；不同主域名时 Safari 可能拦截 Cookie。
- **数据库连接**：`apps/api` 经 Cloudflare Hyperdrive 连接 Neon，驱动仍为 `node-postgres`。Hyperdrive 以 transaction 模式做连接池，支持 `BEGIN`/`COMMIT` 交互式事务。
- Worker 与 API 之间不直接调用：API 写数据库状态，Worker 扫描并调度（[ADR-011](011-worker.md)）。

## Alternatives

- **只把新 API 放 `apps/api`**：迁移量小，但有两套 API、两套鉴权和错误处理。
- **API 与 Worker 一个进程（都在 Containers）**：一个部署单元，但容器被停止时 API 也不可用。
- **业务模块放在 `apps/api/src/modules/*`**：目录简单，但 Worker 不能 import `apps/api`，只能与 API 同进程。
- **web 也部署到 Cloudflare（OpenNext）**：平台统一，但要重新验证 Next.js 16、Sentry、图片等的兼容性。维护者选择继续用 Vercel。
- **Server Component 直接调用包读取数据**：少一次请求，但 web 仍持有数据库连接，边界不清楚。

## Consequences

- web 的每次数据读取多一次到 `apps/api` 的网络请求。Server Component 调用 API 时要转发用户的 Cookie。
- [Architecture Rules](../architecture/overview.md#architecture-rules)、[api.md](../architecture/api.md)、[security.md](../architecture/security.md)、[deployment.md](../architecture/deployment.md)、[environment.md](../architecture/environment.md)、[testing.md](../architecture/testing.md) 中以 Next.js Route Handler 为前提的内容，在迁移对应路由的 Slice 中改写。迁移完成前，这些文档描述的仍是当前代码。
- 下列依赖在 Workers 上的兼容性要在实现 Slice 中按官方文档和测试确认，不猜测：Better Auth、`@waffo/pancake-ts`（RSA 签名）、`@aws-sdk/client-s3`（或改用 R2 binding）、Sentry（`@sentry/cloudflare`）、PostHog（`posthog-node`）、`node-postgres` 的 `nodejs_compat` 要求。CreditService 用的 `pg_advisory_xact_lock` 是事务级锁，要在 Hyperdrive 上用集成测试验证。
- `apps/api` 需要自己的 env schema（Workers 的 env 来自 binding，不是 `process.env`），见 [jobs.md](../architecture/jobs.md) 对 Worker env 的同样要求。
- 本地开发同时运行 `apps/web` 与 `apps/api`；E2E 要同时启动两者。
- 迁移顺序（每步一个 Slice，每步结束时 `main` 可部署）：
  1. `apps/api` 骨架上线：Workers + Hyperdrive、`/api/health`、错误格式、env schema、部署流程；验证事务与 advisory lock。
  2. Better Auth 迁到 `apps/api`，子域名 Cookie；web 的会话检查改为调用 API。
  3. tasks、uploads、analytics consent 迁到 `apps/api`；web 改为 HTTP 调用。
  4. checkout、billing、Waffo webhook 迁到 `apps/api`。
  5. `/admin` 与其余页面改为调用 API；web 去掉 `@repo/db` 等依赖，ESLint 禁止 web 中的 Route Handler 和数据库访问。
  6. 之后的 Termrise 业务 API 直接在 `apps/api` 中实现。
