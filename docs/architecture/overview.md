# Architecture Overview

## Technology Stack

### Frontend

```text
Next.js 16
React
TypeScript
Tailwind CSS
shadcn/ui
next-intl
next-themes
```

---

### Backend

使用：

```text
Next.js Route Handlers
Server Components
Server-side Services
```

Production 只部署 Next.js，不部署独立 API Service。`apps/api`（Hono）是可选骨架，见 [Monorepo](#monorepo)。

Termrise 已决定改为模块化单体：全部 API 迁到 `apps/api`（Cloudflare Workers），`apps/web` 只经 HTTP 调用 API，见 `docs/adr/012-api-modular-monolith.md`。迁移完成前，本文描述的仍是当前代码。

---

### Database

```text
Neon PostgreSQL
Drizzle ORM
```

驱动要求：

```text
支持交互式事务（Credit 扣费依赖事务）

同一套代码既能连 Neon，也能连普通 PostgreSQL（Docker / CI）
```

Neon 的 HTTP 驱动不支持交互式事务，WebSocket 驱动连不上普通 PostgreSQL。
当前实现使用 `node-postgres`（`pg.Pool`）+ `drizzle-orm/node-postgres`，见 `packages/db/src/client.ts`。部署使用 Neon pooled connection string，运行在 Vercel Node runtime。

环境与数据库：

| 环境           | 数据库                                                      |
| -------------- | ----------------------------------------------------------- |
| Production     | Neon `main` 分支                                            |
| Vercel Preview | Neon `preview/{git-branch}` 分支，每个 Preview 一个         |
| 本地开发       | Neon `dev/{topic}` 分支，每个 worktree 一个，从 `main` 创建 |
| 本地自动化测试 | Docker PostgreSQL（`docker-compose.yml`）                   |
| CI 自动化测试  | GitHub Actions PostgreSQL service container                 |

自动化测试不连接 Neon。

---

### Auth

```text
Better Auth
```

支持：

```text
Email Magic Link（通过 Resend 发信）
Google OAuth
```

不支持密码登录。

---

### Payment

```text
Waffo
```

但业务层只能访问：

```text
PaymentProvider
```

不得直接依赖 Waffo。

---

### Storage

```text
Cloudflare R2（S3-compatible API）
```

Bucket 私有，不开放公共读取。每个环境一个 bucket：

| 环境           | Bucket（示例名称，按产品替换）                           | CORS 允许的来源                   |
| -------------- | -------------------------------------------------------- | --------------------------------- |
| Production     | `app-prod`                                               | 生产域名（`https://example.com`） |
| Vercel Preview | `app-preview`                                            | Vercel Preview 域名               |
| 本地开发       | `app-dev`（所有 worktree 共用；默认在本地 SeaweedFS 中） | `http://localhost:3000`           |

- CORS 配置文件在 `infra/r2/cors-{dev,preview,prod}.json`（Wrangler 格式），允许 PUT / GET / HEAD、`Content-Type` 请求头，暴露 `ETag`；用 `wrangler r2 bucket cors set <bucket> --file <json>` 应用。新产品先把文件中的 origins 改成自己的域名；更换生产域名或 Preview 域名时同步更新。
- 每个 bucket 有独立的 Object Read & Write 访问密钥，只能访问自己的 bucket。

本地开发默认用 SeaweedFS（S3 兼容）代替 R2，见 [Local Storage](storage.md#local-storage)；自动化测试使用 FakeStorage。接口、上传流程和限制见 [storage.md](storage.md)。

---

### Paid Action

`apps/web/src/features/tasks/` 是一个示例付费操作：扣 Credits，调用 `AiProvider`（`@repo/ai`），失败时退款。业务层只能访问：

```text
AiProvider
```

新产品用自己的功能（例如调用 AI 模型）替换示例 Provider，见 [tasks.md](tasks.md)。

调用模型的适配器使用 Vercel AI SDK（`ai` 与 `@ai-sdk/*` Provider 包），只在 `packages/ai/src/adapters/` 中引用；业务层只依赖 `AiProvider`。AI SDK 的 `APICallError` 带有请求体（完整 Prompt）和响应体，适配器抛出的错误只保留 HTTP 状态，不带 `cause`。

---

### Hosting

```text
Vercel（区域 iad1）
```

环境、区域、migration 与回滚见 [deployment.md](deployment.md)。

---

### i18n

```text
next-intl
```

---

### Analytics

```text
PostHog（产品事件，需 Cookie 同意）
Vercel Web Analytics（页面访问与流量来源，无 Cookie）
Vercel Speed Insights（页面 Web Vitals，无 Cookie）
```

---

### Monitoring

```text
Sentry
```

---

### Email

```text
Resend
```

只用于 Magic Link。

本地开发不使用本地邮件服务，直接调用 Resend：

```text
RESEND_API_KEY=<本地专用的 API Key，权限 Sending access>
EMAIL_FROM="Acme <onboarding@resend.dev>"
```

- 没有验证域名时，Resend 只允许从 `onboarding@resend.dev` 发信，并且只发给注册 Resend 账号的邮箱。发给其他邮箱返回 403，登录页显示发信失败。
- 要给其他邮箱发信，先在 Resend 验证发信域名，再把 `EMAIL_FROM` 改为该域名的地址。
- 测试邮件计入 Resend 的发信额度。
- 本地的 Key 只放在 `.env.local`，不用于 Preview 或 Production。

---

### Testing

```text
Vitest
Playwright
```

---

### Package Manager

```text
pnpm
```

- 版本通过 `package.json` 的 `packageManager` 字段锁定，本地（Corepack）与 CI 使用同一版本。
- 只提交 `pnpm-lock.yaml`；禁止使用 npm / yarn，不提交 `package-lock.json` / `yarn.lock`。
- CI 安装依赖使用 `pnpm install --frozen-lockfile`。

---

### Code Quality

```text
ESLint（eslint-config-next + eslint-config-prettier）
Prettier（prettier-plugin-tailwindcss，默认配置）
husky + lint-staged
commitlint（@commitlint/config-conventional）
```

Git hooks（husky，`pnpm install` 时通过 `prepare` 脚本自动安装）：

| Hook         | 执行                                                                                                                           |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `pre-commit` | lint-staged：对暂存的代码文件执行 `eslint --fix` + `prettier --write`，对 JSON / Markdown / CSS / YAML 执行 `prettier --write` |
| `commit-msg` | commitlint：commit message 必须符合 Conventional Commits                                                                       |

- ESLint 以 `--max-warnings=0` 运行，warning 也视为失败。
- 格式只由 Prettier 决定；ESLint 关闭与格式相关的规则（eslint-config-prettier）。
- `.editorconfig` 与 Prettier 默认值一致（UTF-8、LF、2 空格缩进），供编辑器使用。
- Import 顺序由 `import/order` 强制（`eslint --fix` 可自动修复）：Node 内置模块 → 第三方包 → `@repo/*` → `@product`、`@/*` → 相对路径。组之间空一行，组内按字母排序。
- `.pen` 设计文件、PNG、`pnpm-lock.yaml`、Drizzle 生成文件不参与格式化（`.prettierignore`）。

---

## Architecture

```text
Browser
   │
   ▼
Next.js (Vercel)
├── Marketing（Landing、Pricing、Legal、Blog）
├── Auth
├── Dashboard（Credits + 示例付费操作）
├── Billing
└── Admin
   │
   ▼
Application Services
├── TaskService
├── CreditService
├── BillingService
├── UploadService
├── AdminService
├── AnalyticsService
└── RateLimitService
   │
   ├─────────────────┐
   │                 │
   ▼                 ▼
PostgreSQL      External Adapters
(Neon)          ├── AiProvider（示例，按产品替换）
                ├── PaymentProvider
                ├── AnalyticsProvider
                └── ObjectStorage（R2 / FakeStorage）
                      │
                Waffo / PostHog / R2
```

核心依赖：

```text
AiProvider
      ↑
TaskService

PaymentProvider
      ↑
BillingService

CreditService
   ↑       ↑
   │       │
Task     Billing
Service  Service
```

---

## Architecture Rules

必须：

```text
Domain
↓
Service
↓
Provider Interface
↓
External Provider
```

禁止：

```text
Route Handler
↓
Waffo
```

禁止：

```text
Route Handler
↓
第三方 SDK（AI 模型、存储等）
```

禁止：

```text
UI
↓
Database
```

Server Components 读取数据也必须通过 Service，不得直接调用 `db`。

---

## Repository Structure

```text
saas-starter/
├── apps/
│   ├── web/                    Next.js 应用（唯一部署到 Vercel 的应用）
│   │   ├── src/
│   │   │   ├── app/
│   │   │   │   ├── (marketing)/   / · pricing · blog · terms · privacy · refund-policy
│   │   │   │   ├── (auth)/        sign-in · sign-up
│   │   │   │   ├── (dashboard)/   dashboard · billing（需要登录）
│   │   │   │   ├── admin/
│   │   │   │   ├── api/           auth · tasks · uploads · checkout · billing/* · analytics/consent · webhooks/waffo
│   │   │   │   └── layout.tsx · sitemap.ts · robots.ts · opengraph-image.tsx · not-found.tsx
│   │   │   ├── features/tasks/    示例付费操作（Service、页面组件）
│   │   │   ├── components/        页面组件
│   │   │   ├── server/            读取 env 的装配（getXService）、admin、credits、http、email
│   │   │   ├── i18n/ · lib/
│   │   │   └── proxy.ts · instrumentation*.ts · sentry.*.config.ts
│   │   ├── messages/ · public/ · scripts/ · tests/（e2e、setup）
│   │   └── next.config.ts · vercel.json · .env.local（不提交）
│   ├── api/                    可选：Hono 独立 API（骨架：/health 与错误契约）
│   └── worker/                 可选：后台任务 Worker（骨架：处理 @repo/jobs 的任务）
├── packages/
│   ├── config/                 env 校验、产品 Manifest 类型
│   ├── db/                     Drizzle schema、Postgres client、migrations、测试数据库工具
│   ├── observability/          logger、AppError 与错误码、日志脱敏
│   ├── credits/                CreditService（余额与 Ledger）
│   ├── billing/                Credit Pack、订阅、Checkout、Webhook；Waffo 与 Fake 适配器
│   ├── auth/                   Better Auth 配置、guards、安全跳转、限流
│   ├── analytics/              PostHog 客户端与服务端、Consent、URL 脱敏
│   ├── storage/                ObjectStorage 接口、R2 与 Fake 适配器、上传
│   ├── ai/                     AiProvider 接口、example、DeepSeek 与 fake 适配器
│   ├── jobs/                   任务队列接口、内存适配器
│   ├── seo/                    sitemap、JSON-LD、IndexNow、关键词矩阵校验
│   └── ui/                     设计 token（theme.css）与基础组件
├── product.config.ts           产品 Manifest（名称、域名、支持邮箱、运营主体）
├── infra/r2/                   R2 CORS 配置
├── seo/                        关键词矩阵数据（keywords.csv、matrix.json、briefs/）
├── .claude/skills/             项目 Skill（`.agents/skills/` 下为指向它们的符号链接）
├── docs/
├── turbo.json · pnpm-workspace.yaml · tsconfig.base.json
├── vitest.config.mts · playwright.config.ts · eslint.config.mjs
└── AGENTS.md · CLAUDE.md · README.md
```

`apps/web/src/app/api/auth/[...all]` 是 Better Auth 的挂载点，不属于业务 API。

`apps/web/src` 中按代码类型放置：

- `features/<name>/`：产品要整体替换的业务功能（示例 Task）。Service、组装和页面组件放在一起，替换时只改这一个目录、`server/product.ts` 和 `server/product-data.ts`。
- `server/product.ts`：平台代码（`server/`、`components/`）读取 Feature 的入口：每次使用的 Credits（`CREDIT_COST_PER_USE`）、读余额前的清理（`beforeBalanceRead`）、管理台的记录列表（`listPaidRecords`）。
- `server/product-data.ts`：删除与导出账号时读写 Feature 的用户内容（`productData.export` / `erase`）。它不带 `server-only`，因为 `scripts/` 中的管理脚本导入它。平台代码和 `scripts/` 只经这两个文件导入 `@/features/*`（ESLint 检查）。
- `server/<domain>/` 和 `components/<domain>/`：可复用的平台能力（billing、credits、auth、analytics、storage）在本应用中的组装和 UI。业务规则在 `packages/*`。
- 平台能力不放进 `features/`，否则会被当作要替换的示例。具体表格见 `apps/web/README.md`。

---

## Monorepo

pnpm workspace + Turborepo。`pnpm build`、`pnpm typecheck`、`pnpm dev` 经 Turborepo 运行；`pnpm lint`、`pnpm test`、`pnpm test:e2e` 在仓库根目录运行一份配置（ESLint、Vitest、Playwright）。

依赖方向：

```text
apps/*  →  packages/*
packages/* 之间只按需要依赖（例如 billing → credits → db）
packages/* 不依赖 apps/*，不读取 product.config.ts
```

包的规则：

- 包名 `@repo/<name>`。包直接发布 TypeScript 源码，不构建；`apps/web/next.config.ts` 的 `transpilePackages` 必须列出 web 用到的每个包。
- 只用子路径导入，例如 `@repo/billing/billing-service`。没有 `index.ts` 汇总导出：汇总导出会把服务端代码（数据库、SDK）带进客户端 bundle。例外：`@repo/db/schema`（`packages/db/src/schema/index.ts`）汇总全部表定义，只在服务端使用。
- 包只提供 `createXService(deps)` 和适配器，不读取 `process.env`，不依赖 Next.js。读取 env、组装单例（`getXService()`）放在应用里，例如 `apps/web/src/server/billing/billing.ts`。例外：
  - `@repo/config/env` 定义 env schema，由应用调用。
  - `@repo/db/client` 的 `db()` 读取 `DATABASE_URL`，返回进程内单例连接。
  - `@repo/db/testing/*` 读取 `TEST_DATABASE_URL`（未设置时加载 `apps/web/.env.local`），只在测试中使用。
  - `packages/db/drizzle.config.ts`（drizzle-kit 配置，不是运行时代码）读取 `DATABASE_URL`（未设置时加载 `apps/web/.env.local`）。

- 产品数据（品牌、域名）从 `product.config.ts` 进入应用，再以参数传给包，例如 `createAuth({ appName })`。Credit Pack 价格（`packages/billing/src/credit-packs.ts`）、订阅方案（`packages/billing/src/subscription-plans.ts`）和 Waffo 商品 ID（`packages/billing/src/adapters/waffo.ts` 的 `WAFFO_PRODUCT_IDS`、`WAFFO_SUBSCRIPTION_PRODUCT_IDS`）是例外：它们是产品数据，但与计费代码放在一起，每个产品在自己的仓库里修改。
- 业务规则只实现一次。`apps/api` 和 `apps/worker` 调用与 web 相同的包，不复制规则。

ESLint（`eslint.config.mjs`，规则测试在 `eslint-boundaries.test.ts`）检查：

- `packages/*` 不导入 `@/*`、`@product`、`apps/` 下的文件，不导入 `next` / `next/*`，不导入 `@repo/config/env`，不读取 `process.env`（上面列出的例外除外）。
- 包只导入自己 `package.json`（`dependencies` 或 `devDependencies`）中声明的 `@repo/*` 包。要依赖新的包，先在 `package.json` 中声明。`package-graph.test.ts` 检查声明的依赖没有环。
- 页面、布局、组件、Server Action 和 Route Handler（`apps/web/src/app/**`、`components/**`、`features/**/*.tsx`）不导入 `@repo/db/*` 和 `drizzle-orm`，数据通过 Service 读写（例如 `@/server/credits/credits` 的 `getCreditService()`）。`app/**` 中的测试文件除外：它们用测试数据库准备数据和检查结果。
- `server/**`、`components/**`、`lib/**`、`i18n/**` 不导入 `@/features/*`，经 `@/server/product` 读取（测试文件除外）。`app/**` 是 Feature 的路由和页面，可以导入。
- `apps/*/src` 和 `packages/*/src` 不使用 `console`（`no-console`），日志经 logger 输出（`logger.ts` 和 `*.test.ts` 除外）。

汇总导出和「同一业务规则只实现一次」不由 ESLint 检查，只靠 Review 保证。

`apps/api` 与 `apps/worker` 是骨架：有接口和测试，没有部署配置。Termrise 把 `apps/worker` 部署到 Cloudflare Containers，见 [Worker](deployment.md#worker)。`pnpm dev:api` 在 3001 端口启动 API。Worker 需要一个持久化队列适配器才能运行，见 [jobs.md](jobs.md)。

Turborepo 的配置和命令随版本变化。修改 `turbo.json` 前，先读安装包自带的文档：`node_modules/turbo/docs/`。`turbo.json` 设置了 `agentGuidance: false`，Turborepo 不再向 `AGENTS.md` 写入说明。

---
