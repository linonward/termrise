# saas-starter

按 Credit Pack 和月度订阅收费的 AI SaaS 模板仓库（GitHub Template Repository）。每个新产品从本模板创建一个独立仓库。

本模板从 ClipSKU 的生产代码中抽出。品牌占位为 **Acme**，域名 `example.com`，支持邮箱 `support@example.com`，运营主体 **Acme Inc.**。

规则与文档入口见 [AGENTS.md](AGENTS.md)。

## 包含的功能

- pnpm workspace + Turborepo：Next.js 应用在 `apps/web`，可复用模块在 `packages/*`（config、db、observability、credits、billing、auth、analytics、storage、ai、jobs、seo、ui），见 [Monorepo](docs/architecture/overview.md#monorepo)。
- 可选应用骨架：`apps/api`（Hono，健康检查与共用错误契约）、`apps/worker`（后台任务），见 [jobs.md](docs/architecture/jobs.md)。
- 认证：Better Auth（Magic Link、Google、One Tap），见 [security.md](docs/architecture/security.md)。
- Credits：CreditService 账本，余额只经它修改，见 [data-model.md](docs/architecture/data-model.md)。
- 支付：Waffo Pancake 一次性 Credit Pack、Webhook、退款、Pending 过期，见 [billing.md](docs/architecture/billing.md)。
- 月度订阅：每期发放 Credits、站内取消、退款按期扣回，见 [billing.md](docs/architecture/billing.md)。
- 示例任务：`tasks` 表、TaskService、AiProvider（`@repo/ai`）、`/api/tasks`、Dashboard 的 TaskPanel，见 [tasks.md](docs/architecture/tasks.md)。
- 存储：R2 预签名上传与 `/api/uploads`，测试用 FakeStorage，见 [storage.md](docs/architecture/storage.md)。
- 管理台：`/admin` 搜索用户、调整 Credits，另有 `pnpm admin:adjust`，见 [runbook.md](docs/runbook.md)。
- Analytics 与监控：PostHog（用户同意 Cookie 后）、服务端事件、Vercel Web Analytics、Speed Insights、Sentry、结构化日志，见 [observability.md](docs/architecture/observability.md)。
- i18n：英文 + 中文（next-intl，Cookie `NEXT_LOCALE`），见 [ux.md](docs/product/ux.md)。
- 安全：限流、Security Headers，见 [security.md](docs/architecture/security.md)。
- 设计系统：token 与 shadcn 风格的 UI 组件，见 [design-system.md](docs/design/design-system.md)。
- 营销页面：Landing、Pricing、Terms / Privacy / Refund Policy、Blog（2 篇示例）、sitemap、robots、`llms.txt`、结构化数据、OG 图片。
- 脚本：`pnpm indexnow`、`pnpm waffo:products`、`pnpm seo:validate`。
- SEO 关键词矩阵：项目 Skill `.claude/skills/seo-keyword-matrix`，数据在 `seo/`，见 [Keyword Matrix](docs/product/ux.md#keyword-matrix)。
- 工程：CI（migration 与 schema 一致、lint、format、typecheck、test、build、Playwright E2E、PR 标题 commitlint、生产依赖漏洞扫描）、每周依赖检查（漏洞与过时的包，可选飞书通知）、husky、commitlint、lint-staged，见 [workflow.md](docs/workflow.md)。

## 删除的功能

原产品的业务功能不在模板中：视频与图片生成（fal、百炼）、生成状态机与 Provider Webhook、Prompt 预设、Studio、内容审核、用户反馈、通知、卖家画像与 Onboarding、Use Case 页面、效果评测、Spike 脚本、素材生成脚本、设计画稿。

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

## 从模板创建新产品

GitHub 上的「Template repository」已经开启。用「Use this template」创建新仓库，然后按下面的清单操作。

### 品牌

- [ ] 填写 `product.config.ts`（产品 ID、名称、域名、支持邮箱、运营主体、注册赠送的 Credits）。代码中的品牌、支持邮箱和 IndexNow 的 sitemap 地址都从这里读取。
- [ ] 替换文案中的 Acme、`example.com`、`support@example.com`、Acme Inc.。用 `grep -rn "Acme\|example\.com" .` 检查，至少包括：
  - `apps/web/messages/*.json`（含法律文本）
  - `apps/web/public/llms.txt`
  - `.env.example` 的 `EMAIL_FROM`
  - `package.json` 的 `name`
  - `docker-compose.yml` 的 `name` 与端口（每个产品用不同端口，同时修改 `.env.example` 和文档中的 `TEST_DATABASE_URL`）
- [ ] 生成新的 IndexNow Key：在 `apps/web/public/` 中替换 `{key}.txt`，并修改 `apps/web/scripts/indexnow.ts` 的 `INDEXNOW_KEY`。
- [ ] 替换 Logo：`apps/web/src/components/logo-mark.tsx`、`apps/web/src/app/icon.svg`、`apps/web/src/app/apple-icon.png`、`apps/web/src/app/favicon.ico`、`apps/web/src/app/opengraph-image.tsx`。
- [ ] 修改 `AGENTS.md` 第一段的产品说明。

### 产品

- [ ] 审阅法律文本（Terms、Privacy、Refund Policy），写入真实的运营主体、服务商和数据处理说明。
- [ ] 修改 Credit Pack 价格：`packages/billing/src/credit-packs.ts`，然后用 `pnpm waffo:products` 同步 Waffo 商品，见 [Change Prices](docs/runbook.md#change-prices)。
- [ ] 替换示例任务：Provider、`tasks` 表的字段、UI，见 [tasks.md](docs/architecture/tasks.md)。
- [ ] 产品生成 AI 内容时，在申请 Waffo AIGC 审核前加入内容审核（屏蔽词表、审核日志），见 [payment-provider-spike.md](docs/payment-provider-spike.md)。
- [ ] 替换 Blog 示例文章和 Landing 文案。
- [ ] 在 [docs/roadmap.md](docs/roadmap.md) 写入 Slice Plan。

### 外部服务

每个产品使用自己的账号资源。变量名见 [environment.md](docs/architecture/environment.md)，部署见 [deployment.md](docs/architecture/deployment.md)。

- [ ] 创建 Neon 项目。
- [ ] 创建 R2 Bucket（dev 与 production）。
- [ ] 在 Resend 验证发信域名。
- [ ] 创建 Google OAuth Client。
- [ ] 创建 PostHog 项目。
- [ ] 创建 Sentry 项目。
- [ ] 创建 Waffo 商店与商品。
- [ ] 创建 Vercel 项目：Root Directory 设为 `apps/web`，并设置环境变量。
