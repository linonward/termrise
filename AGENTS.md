# AGENTS.md

Termrise：面向独立开发者的英文热词发现、产品机会验证、MVP 启动及首单复盘系统，见 [product.md](docs/product/product.md)。本仓库从 saas-starter 模板创建；模板的 Credit Pack 与订阅代码保留，暂时不用于对外收费（订阅规则见 [ADR-009](docs/adr/009-subscription.md)）。

本文件是所有文档的唯一入口：只放每次都必须遵守的规则和导航，细节在 `docs/` 下。

## Hard Rules

每条只写禁令，细节以链接文档为准。

1. 禁止在 `main` 上修改或提交 → [Branch & Worktree](docs/workflow.md#branch--worktree)
2. 每个任务按固定流程：先测试、最小实现、不扩大 Scope、不猜第三方 API、冲突时停下来 → [Agent Operating Rules](docs/workflow.md#agent-operating-rules)
3. 不做禁止清单里的功能 → [What We Are NOT Building](docs/product/product.md#what-we-are-not-building)
4. 不跨层调用 → [Architecture Rules](docs/architecture/overview.md#architecture-rules)
5. 余额只经 CreditService 修改 → [CreditService](docs/architecture/data-model.md#creditservice)
6. Task 状态只经 TaskService 修改 → [tasks.md](docs/architecture/tasks.md)
7. 普通测试不调用真实 Provider、不 mock 数据库 → [testing.md](docs/architecture/testing.md)
8. Secret 不进客户端 → [Security Requirements](docs/architecture/security.md#security-requirements)
9. 日志与 Analytics 不记录 Secret、完整 Prompt、Email → [observability.md](docs/architecture/observability.md)
10. 用户可见文案不硬编码 → [Internationalization](docs/product/ux.md#internationalization)
11. UI 不使用设计系统以外的颜色、字号、间距和组件 → [Design System](docs/design/design-system.md)
12. 回复用户不用中文以外的语言，不违反 ASD-STE100 写作规则 → [Reply Style](docs/workflow.md#reply-style)
13. `packages/*` 不依赖 `apps/*`、不读取 env、不用汇总导出；同一业务规则不在两个应用中实现 → [Monorepo](docs/architecture/overview.md#monorepo)

## Where to Look

| 正在做                                                                      | 先读                                                                         |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 任意 Slice                                                                  | [docs/roadmap.md](docs/roadmap.md)（Slice Plan、已确认决策、Open Questions） |
| 开分支 / 提交 / PR                                                          | [docs/workflow.md](docs/workflow.md)                                         |
| 产品定位、Scope、定价                                                       | [docs/product/product.md](docs/product/product.md)                           |
| Termrise 业务模块（热词、关键词、SERP、机会、AI 任务、队列、预算）          | [docs/architecture/termrise.md](docs/architecture/termrise.md)               |
| Starter 现状：哪些模块已实现、缺失、与 Termrise 方案的冲突                  | [docs/architecture/starter-audit.md](docs/architecture/starter-audit.md)     |
| 页面、交互、文案、i18n、SEO、关键词矩阵                                     | [docs/product/ux.md](docs/product/ux.md)                                     |
| 视觉、token、组件、设计稿（Pen）                                            | [docs/design/design-system.md](docs/design/design-system.md)                 |
| 技术栈、架构、目录结构、Monorepo 与包的规则                                 | [docs/architecture/overview.md](docs/architecture/overview.md)               |
| 数据库、Credits                                                             | [docs/architecture/data-model.md](docs/architecture/data-model.md)           |
| 示例任务、TaskService、AiProvider                                           | [docs/architecture/tasks.md](docs/architecture/tasks.md)                     |
| 上传、R2                                                                    | [docs/architecture/storage.md](docs/architecture/storage.md)                 |
| 后台任务、Worker、队列                                                      | [docs/architecture/jobs.md](docs/architecture/jobs.md)                       |
| API 路由、错误码                                                            | [docs/architecture/api.md](docs/architecture/api.md)                         |
| 支付、Waffo、Credit Packs                                                   | [docs/architecture/billing.md](docs/architecture/billing.md)                 |
| 认证、权限、限流                                                            | [docs/architecture/security.md](docs/architecture/security.md)               |
| PostHog、Sentry、日志                                                       | [docs/architecture/observability.md](docs/architecture/observability.md)     |
| 测试                                                                        | [docs/architecture/testing.md](docs/architecture/testing.md)                 |
| 环境变量                                                                    | [docs/architecture/environment.md](docs/architecture/environment.md)         |
| 部署、区域、migration、回滚、备份                                           | [docs/architecture/deployment.md](docs/architecture/deployment.md)           |
| Waffo 接入记录、上线要求                                                    | [docs/payment-provider-spike.md](docs/payment-provider-spike.md)             |
| 线上问题处理（调 Credits、退款差额、轮换 Secret、回滚、恢复数据、删除账号） | [docs/runbook.md](docs/runbook.md)                                           |
| 架构决策的理由与被否决的方案                                                | [docs/adr/](docs/adr/)                                                       |

## Docs Rules

- **引用单向向下**：`AGENTS.md` → `docs/workflow.md`、`docs/roadmap.md` → `docs/product/`、`docs/design/`、`docs/architecture/`。下层文档不得链接上层文档（不链接 `AGENTS.md`，product / design / architecture 不链接 roadmap / workflow）。同层文档之间的链接也只能单向，不得互相引用。
- **不使用全局章节编号**：引用用相对链接 + 标题锚点，例如 `[Credit Invariants](docs/architecture/data-model.md#credit-invariants)`。改标题时要同步修改指向它的链接。
- **新功能**：写进对应领域文档新增的小节；如果是新领域，在 `docs/product/` 或 `docs/architecture/` 下新建文件，并加到上面的 Where to Look 表。
- **决策**：已确认的决策写进 [docs/roadmap.md](docs/roadmap.md#confirmed-decisions) 的 Confirmed Decisions；需要记录理由的写 ADR（`docs/adr/`）。

## Commands

包管理器为 pnpm，见 [Package Manager](docs/architecture/overview.md#package-manager)。

| 命令                                                                   | 作用                                                                                                                                                                                                                                            |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install`                                                         | 安装依赖，同时安装 Git hooks                                                                                                                                                                                                                    |
| `pnpm dev`                                                             | 本地开发（只启动 `apps/web`）                                                                                                                                                                                                                   |
| `pnpm dev:api`                                                         | 启动可选的 Hono API（`apps/api`，端口 3001）                                                                                                                                                                                                    |
| `pnpm lint`                                                            | ESLint（warning 视为失败）                                                                                                                                                                                                                      |
| `pnpm format` / `pnpm format:check`                                    | Prettier 格式化 / 检查                                                                                                                                                                                                                          |
| `pnpm typecheck`                                                       | 生成路由类型并执行 `tsc --noEmit`                                                                                                                                                                                                               |
| `pnpm test` / `pnpm test:unit` / `pnpm test:integration`               | Vitest：全部 / 单元 / 集成（集成测试需要 Docker PostgreSQL）                                                                                                                                                                                    |
| `pnpm test:watch`                                                      | Vitest watch 模式                                                                                                                                                                                                                               |
| `pnpm test:coverage`                                                   | 运行全部 Vitest 并统计覆盖率（不含 E2E），HTML 报告在 `coverage/`                                                                                                                                                                               |
| `pnpm test:e2e`                                                        | Playwright（先执行 `pnpm build`，测试用 `pnpm --filter web start --port 3100` 启动应用）                                                                                                                                                        |
| `docker compose up -d postgres`                                        | 启动本地测试数据库（端口 54330）                                                                                                                                                                                                                |
| `docker compose up -d storage`                                         | 启动代替 R2 的本地 SeaweedFS（端口 8333），见 [Local Storage](docs/architecture/storage.md#local-storage)                                                                                                                                       |
| `pnpm db:generate` / `pnpm db:migrate` / `pnpm db:studio`              | 生成 migration / 执行 migration（`DATABASE_URL`）/ 打开 Drizzle Studio                                                                                                                                                                          |
| `pnpm waffo:products [--apply \| --publish <pack/plan…>]`              | 不带参数只列出计划的商品名和价格；`--apply` 同步 Waffo 一次性商品与 `CREDIT_PACKS`、订阅商品与 `SUBSCRIPTION_PLANS`；`--publish` 接受 pack 和 plan id（Key 决定 test 或 production），改价顺序见 [Change Prices](docs/runbook.md#change-prices) |
| `pnpm admin:adjust --user <id> --amount=<±n> --id <uuid> --reason "…"` | 经 CreditService 手动调整 Credits（`DATABASE_URL` 指向目标库），见 [Adjust Credits](docs/runbook.md#adjust-credits)                                                                                                                             |
| `pnpm admin:export-user --user <id> --out <file>`                      | 导出一个用户的数据为 JSON（数据访问请求），见 [Delete or Export an Account](docs/runbook.md#delete-or-export-an-account)                                                                                                                        |
| `pnpm admin:delete-user --user <id> [--yes]`                           | 删除账号：匿名化并保留交易记录；不加 `--yes` 只预览，见 [Delete or Export an Account](docs/runbook.md#delete-or-export-an-account)                                                                                                              |
| `pnpm indexnow [url…]`                                                 | 部署到 Production 后，把 sitemap 中的全部 URL（或指定的 URL）提交到 IndexNow（Bing 等），见 [SEO](docs/product/ux.md#seo)                                                                                                                       |
| `pnpm seo:validate`                                                    | 校验 `seo/matrix.json`（`pnpm test` 也运行）；导入和打分用 `seo-keyword-matrix` Skill 的 `scripts/`，见 [Keyword Matrix](docs/product/ux.md#keyword-matrix)                                                                                     |
| `pnpm build` / `pnpm --filter web start`                               | 生产构建 / 启动 `apps/web` 的生产构建                                                                                                                                                                                                           |
