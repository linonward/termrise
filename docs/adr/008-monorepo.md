# ADR-008: Monorepo

- Status: Accepted
- Date: 2026-10-08

## Context

Starter 是多个产品的模板。认证、Credits、支付、Analytics 等模块在每个产品中重复使用；部分产品还需要独立 API 或后台任务。所有代码在一个 Next.js 项目里时，模块边界只靠目录约定，没有工具检查。

## Decision

- 仓库改为 pnpm workspace + Turborepo：Next.js 应用在 `apps/web`，可复用模块在 `packages/*`，可选的 `apps/api`（Hono）和 `apps/worker` 只有骨架。
- 运行时仍按 [ADR-001](001-nextjs-monolith.md)：只部署 `apps/web` 一个应用。需要独立 API 或常驻 Worker 时再启用对应骨架，并且调用同一组包。
- 包直接发布 TypeScript 源码，用子路径导入，不读取 env，不依赖应用。规则见 [Monorepo](../architecture/overview.md#monorepo)。
- 保留 ESLint + Prettier；不换 Biome（缺少 Next.js 规则和 Tailwind class 排序）。
- 一个产品一个仓库：新产品从模板创建，不把多个产品放进同一个 monorepo。

## Alternatives

- **保持单个 Next.js 项目**：配置最少，但模块边界没有检查，`apps/api` / `apps/worker` 无法复用模块。
- **包先构建再发布（tsc / tsup 输出 dist）**：每个包多一步构建和 watch；当前只有内部使用者，直接用源码更简单。
- **所有产品共用一个 monorepo**：共享代码最直接，但产品的部署、权限和发布节奏互相影响。

## Consequences

- `apps/web/next.config.ts` 的 `transpilePackages` 必须列出用到的包，新增包时同步修改。
- Vercel 项目的 Root Directory 是 `apps/web`；本地变量在 `apps/web/.env.local`。
- 路由同时改名：`/sign-in`、`/sign-up`、`/billing`、`/api/checkout`、`/api/webhooks/waffo`。
- 包里的服务通过参数接收产品数据（例如 `appName`、Checkout 成功地址），测试不依赖应用。
