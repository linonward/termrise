# Termrise

面向独立开发者的英文热词发现、产品机会验证、MVP 启动及首单复盘系统，见 [product.md](docs/product/product.md)。域名 `termrise.com`，支持邮箱 `support@termrise.com`；运营主体暂用占位值 **Termrise**，上线前由维护者确认。

本仓库从 saas-starter 模板创建。Termrise 暂时不对外收费：`product.config.ts` 的 `billingEnabled: false` 隐藏 Pricing、Billing、Credits 和退款政策的全部入口，注册不发 Credits；收费代码与 API 保留，见 [Confirmed Decisions](docs/roadmap.md#confirmed-decisions)。

规则与文档入口见 [AGENTS.md](AGENTS.md)。

## 从模板继承的功能

- pnpm workspace + Turborepo：Next.js 应用在 `apps/web`，可复用模块在 `packages/*`（config、db、observability、credits、billing、auth、analytics、storage、ai、jobs、seo、ui），见 [Monorepo](docs/architecture/overview.md#monorepo)。
- 可选应用骨架：`apps/api`（Hono，健康检查与共用错误契约）、`apps/worker`（后台任务），见 [jobs.md](docs/architecture/jobs.md)。
- 认证：Better Auth（Magic Link、Google、One Tap），见 [security.md](docs/architecture/security.md)。
- Credits：CreditService 账本，余额只经它修改，见 [data-model.md](docs/architecture/data-model.md)。
- 支付：Waffo Pancake 一次性 Credit Pack、Webhook、退款、Pending 过期，见 [billing.md](docs/architecture/billing.md)。
- 月度订阅：每期发放 Credits、站内取消、退款按期扣回，见 [billing.md](docs/architecture/billing.md)。
- 示例任务：`tasks` 表、TaskService、AiProvider（`@repo/ai`）、`/api/tasks`、Dashboard 的 TaskPanel，见 [tasks.md](docs/architecture/tasks.md)。
- 存储：R2 预签名上传与 `apps/api` 的 `/api/uploads`，测试用 FakeStorage，见 [storage.md](docs/architecture/storage.md)。
- 管理台：`/admin` 搜索用户、调整 Credits，另有 `pnpm admin:adjust`，见 [runbook.md](docs/runbook.md)。
- Analytics 与监控：PostHog（用户同意 Cookie 后）、服务端事件、Vercel Web Analytics、Speed Insights、Sentry、结构化日志，见 [observability.md](docs/architecture/observability.md)。
- i18n：英文 + 中文（next-intl，Cookie `NEXT_LOCALE`），见 [ux.md](docs/product/ux.md)。
- 安全：限流、Security Headers，见 [security.md](docs/architecture/security.md)。
- 设计系统：token 与 shadcn 风格的 UI 组件，见 [design-system.md](docs/design/design-system.md)。
- 营销页面：Landing、Terms / Privacy、Blog、sitemap、robots、`llms.txt`、结构化数据、OG 图片；Pricing 与 Refund Policy 在 `billingEnabled` 打开时显示。
- 脚本：`pnpm indexnow`、`pnpm waffo:products`、`pnpm seo:validate`。
- SEO 关键词矩阵：项目 Skill `.claude/skills/seo-keyword-matrix`，数据在 `seo/`，见 [Keyword Matrix](docs/product/ux.md#keyword-matrix)。
- 工程：CI（migration 与 schema 一致、lint、format、typecheck、test、build、Playwright E2E、PR 标题 commitlint、生产依赖漏洞扫描）、每周依赖检查（漏洞与过时的包，可选飞书通知）、husky、commitlint、lint-staged，见 [workflow.md](docs/workflow.md)。

## 快速开始

1. 安装依赖和 Git hooks：

   ```bash
   pnpm install
   ```

2. 启动本地测试数据库（端口 54330）和代替 R2 的本地 SeaweedFS（端口 8333）：

   ```bash
   docker compose up -d postgres storage
   ```

3. 复制 `.env.example` 为 `apps/web/.env.local`，并填写变量（Next.js、测试工具和 Drizzle 都从这里读取）。`TEST_DATABASE_URL` 指向本地 Docker：

   ```text
   TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:54330/app_test_<topic>
   ```

   变量说明见 [environment.md](docs/architecture/environment.md)。`DATABASE_URL` 指向 Neon 开发分支。`R2_*` 使用本地 SeaweedFS 的值，见 [Local Storage](docs/architecture/storage.md#local-storage)。

4. 执行 migration：

   ```bash
   pnpm db:migrate
   ```

5. 启动开发服务器：

   ```bash
   pnpm dev
   ```

   登录由 `apps/api` 提供：另开一个终端运行 `pnpm dev:api`，变量见 [API Bindings](docs/architecture/environment.md#api-bindings)。本地用 Magic Link 登录时，`RESEND_API_KEY` 和 `EMAIL_FROM` 的填法见 [Email](docs/architecture/overview.md#email)。

6. 运行测试：

   ```bash
   pnpm test
   ```

7. 运行 E2E 测试。先构建，Playwright 用 `pnpm --filter web start --port 3100` 启动应用。构建时要设置 `NEXT_PUBLIC_POSTHOG_KEY`，否则 Cookie 横幅的测试失败：

   ```bash
   NEXT_PUBLIC_POSTHOG_KEY=phc_e2e_test pnpm build
   pnpm test:e2e
   ```

   `TEST_DATABASE_URL` 的写法见 [testing.md](docs/architecture/testing.md)。

测试规则见 [testing.md](docs/architecture/testing.md)。

## 上线前待办

品牌（S11 已完成 `product.config.ts`、文案、`llms.txt`、E2E 断言和本文件；S12 已完成品牌色与 Logo）：

- [ ] 确认运营主体，改 `product.config.ts` 的 `operator`。
- [ ] 审阅法律文本（Terms、Privacy）：现在仍是模板的 Credits 与付款条款，只替换了品牌名和域名。
- [ ] 生成新的 IndexNow Key：在 `apps/web/public/` 中替换 `{key}.txt`，并修改 `apps/web/scripts/indexnow.ts` 的 `INDEXNOW_KEY`。
- [ ] `docker-compose.yml` 的 `name` 仍为 `saas-starter`，本机的模板仓库共用这些容器和端口。改名时同时修改端口、`.env.example` 和文档中的 `TEST_DATABASE_URL`。
- [ ] 按 SEO 关键词矩阵写 Blog 文章（`seo/matrix.json` 现在为空）。

外部服务：每个服务使用 Termrise 自己的账号资源。变量名见 [environment.md](docs/architecture/environment.md)，部署见 [deployment.md](docs/architecture/deployment.md)。

- [ ] 创建 Neon 项目。
- [ ] 创建 R2 Bucket（dev 与 production）。
- [ ] 在 Resend 验证发信域名。
- [ ] 创建 Google OAuth Client。
- [ ] 创建 PostHog 项目。
- [ ] 创建 Sentry 项目。
- [ ] 部署 `apps/api`（Cloudflare Workers + Hyperdrive），见 [API](docs/architecture/deployment.md#api)。
- [ ] 创建 Vercel 项目：Root Directory 设为 `apps/web`，并设置环境变量。
