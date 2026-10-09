# ADR-001: Next.js Monolith

- Status: Accepted
- Date: 2026-10-05

## Context

一个人快速上线可收费的产品。需要页面、API、webhook、数据库事务，不需要独立扩展的服务。

## Decision

整个应用是一个 Next.js 项目，部署在 Vercel：页面用 Server Components，API 和 webhook 用 Route Handlers（Node.js runtime），业务逻辑放在 Server-side Services。不拆独立的 API 服务。

分层规则（Route Handler / UI 不直接访问数据库和外部 SDK）见 [Architecture Rules](../architecture/overview.md#architecture-rules)。

## Alternatives

- **前端 + 独立后端（Express / NestJS 等）**：两套部署、两套环境变量和鉴权，对一个人的产品不值得。
- **Edge runtime**：数据库驱动和交互式事务需要 Node.js，见 [Region](../architecture/deployment.md#region)。

## Consequences

- 一次部署、一套类型，Service 可以被页面和 Route Handler 共用。
- 长任务受 Vercel 函数时长限制，必须异步（webhook + 读取时同步，不用 Cron），见 [Sync vs Async](../architecture/tasks.md#sync-vs-async)。
- 日后需要拆分时，Service 和 Provider 接口就是拆分边界。
