# Environment Contract

## Environment Contract

`packages/config/src/env.ts` 的 `serverEnv()` 首次调用时解析并缓存服务端变量，缺失或格式错误抛出 `EnvError`。校验是惰性的，`apps/web/src/instrumentation.ts` 不执行环境校验；构建成功不能证明运行环境完整。

本地变量放在 `apps/web/.env.local`（不提交）：Next.js 从这里读取；`packages/db/drizzle.config.ts` 和测试数据库工具（`packages/db/src/testing/test-database.ts`）在没有对应环境变量时也读取这个文件。模板见仓库根目录的 `.env.example`。空值（`KEY=`）视为未设置：可选变量取默认值，必填变量报缺失。

web（`apps/web`）只渲染页面：数据、支付、存储和 AI 都在 `apps/api`，变量见 [API Bindings](#api-bindings)。`packages/config/src/env.ts` 只校验下表中 web 运行时读取的变量。`APP_URL`、`NEXT_PUBLIC_API_URL`、`SENTRY_DSN` 必须为 URL，`R2_ENDPOINT` 设置时也必须为 URL。

| Variable                  | Scope           | Notes                                                                                                                                                                                                                                                           |
| ------------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VERCEL_ENV`              | server          | 可选 `production` / `preview` / `development`，由 Vercel 注入；`production` 时禁止 `R2_ENDPOINT`                                                                                                                                                                |
| `APP_URL`                 | server          | 站点根 URL，用于 metadataBase、sitemap / robots 中的绝对 URL                                                                                                                                                                                                    |
| `NEXT_PUBLIC_API_URL`     | client + server | `apps/api` 的地址（本地 `http://localhost:3001`）。浏览器经它调用 API，构建时内联；服务端用它读取 session 和页面数据                                                                                                                                            |
| `GOOGLE_CLIENT_ID`        | server          | Google One Tap 的 client ID（公开值），与 `apps/api` 相同                                                                                                                                                                                                       |
| `R2_ENDPOINT`             | server          | 可选，只用于本地：CSP 允许浏览器向本地 S3 兼容服务（`http://localhost:8333`，见 [Local Storage](storage.md#local-storage)）上传。`VERCEL_ENV=production` 时禁止设置                                                                                             |
| `SENTRY_DSN`              | server          |                                                                                                                                                                                                                                                                 |
| `NEXT_PUBLIC_SENTRY_DSN`  | client          |                                                                                                                                                                                                                                                                 |
| `SENTRY_AUTH_TOKEN`       | build           | source maps 上传                                                                                                                                                                                                                                                |
| `SENTRY_ORG`              | build           | Sentry org slug（source maps 上传）                                                                                                                                                                                                                             |
| `SENTRY_PROJECT`          | build           | Sentry project slug（source maps 上传）                                                                                                                                                                                                                         |
| `NEXT_PUBLIC_POSTHOG_KEY` | client          | PostHog project key，构建时内联；服务端事件由 `apps/api` 的 `POSTHOG_KEY` 发送                                                                                                                                                                                  |
| `DATABASE_URL`            | scripts         | web 运行时不读取。`pnpm db:migrate`、admin 脚本（`apps/api/scripts/`）和 Vercel Preview 构建前的 migration 读取它；Production 与 Preview 由 Neon 集成注入。`createDb` 把 `prefer` / `require` / `verify-ca` 改为 `verify-full`，带 `uselibpqcompat=true` 时不改 |
| `TEST_DATABASE_URL`       | test            | 仅测试使用，必须指向本地 Docker / CI PostgreSQL，见 [testing.md](testing.md)                                                                                                                                                                                    |
| `WAFFO_*`                 | scripts         | 只有 `pnpm waffo:products` 读取（`WAFFO_MERCHANT_ID`、`WAFFO_PRIVATE_KEY`、`WAFFO_STORE_ID`），环境由 Key 决定                                                                                                                                                  |

校验错误只包含变量名和规则，不输出值。

`.env.example` 提供应用配置模板，不含真实值；它不含 source maps 上传使用的 `SENTRY_ORG` / `SENTRY_PROJECT`。`VERCEL_ENV` 和 `VERCEL` 由 Vercel 注入（`VERCEL=1` 时才加载 Web Analytics 与 Speed Insights）；`CI` 由 GitHub Actions 注入，影响 Playwright 的重试和 Sentry 构建日志。测试使用的 `TEST_DATABASE_URL` 由 test harness 单独校验。此表不表示每个变量均由 `serverEnv()` 解析：客户端与构建变量在各自入口读取。

CI（`.github/workflows/ci.yml`）只设置 `TEST_DATABASE_URL`（`app_test_ci` / `app_test_e2e`）和 E2E 构建时内联的 `NEXT_PUBLIC_POSTHOG_KEY=phc_e2e_test`。E2E 的其余变量来自 `apps/web/tests/setup/e2e-env.ts`，都是占位值。

新增、删除或改名变量时，同时更新本文件的 [Environment Contract](#environment-contract)、`.env.example` 和 `packages/config/src/env.ts`。

---

## API Bindings

`apps/api` 运行在 Cloudflare Workers，没有 `process.env`：配置来自 `apps/api/wrangler.jsonc` 的 binding，在路由中经 `c.env` 读取，类型在 `apps/api/src/env.ts`。`packages/*` 不读取它们，由路由作为参数传入。

| Binding / 变量                                                           | 作用                                                                                                                                   |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `HYPERDRIVE`                                                             | Hyperdrive 配置，`connectionString` 指向 Neon（创建步骤见 deployment.md 的 API 一节）                                                  |
| `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE`               | 只用于本地 `pnpm dev:api`：wrangler dev 直接连接这个数据库（例如本 worktree 的 Neon `dev/{topic}` 分支），不经过 Hyperdrive            |
| `APP_URL`                                                                | web 的地址：CORS origin、Better Auth 的 trusted origin、登录后跳转的 origin                                                            |
| `BETTER_AUTH_URL`                                                        | API 自己的地址；Magic Link 和 Google 回调地址用它生成                                                                                  |
| `BETTER_AUTH_SECRET`                                                     | 至少 32 字符；只有 `apps/api` 使用                                                                                                     |
| `AUTH_COOKIE_DOMAIN`                                                     | 可选，web 与 API 共同的上级域名（例如 `termrise.com`）；本地不设置                                                                     |
| `GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET`                               | Google OAuth；client ID 也给 web 的 One Tap 使用                                                                                       |
| `RESEND_API_KEY`、`EMAIL_FROM`                                           | 登录邮件（Resend），本地填法见 overview.md 的 Email                                                                                    |
| `POSTHOG_KEY`、`POSTHOG_HOST`                                            | 可选，服务端事件；未设置 key 时不发送；host 默认 `https://us.i.posthog.com`                                                            |
| `TASK_PROVIDER`                                                          | `example` \| `deepseek` \| `fake`，默认 `example`；含义同 web 的同名变量                                                               |
| `R2_ACCOUNT_ID`、`R2_ACCESS_KEY_ID`、`R2_SECRET_ACCESS_KEY`、`R2_BUCKET` | 签名上传（`POST /api/uploads`）；与 web 用同一个 bucket 和 token                                                                       |
| `R2_ENDPOINT`                                                            | 可选，只用于本地（SeaweedFS）。Workers 无法判断是否为 Production，因此 Production 不设置它由部署步骤保证                               |
| `STORAGE_PROVIDER`                                                       | `r2` \| `fake`，默认 `r2`                                                                                                              |
| `PAYMENT_PROVIDER`                                                       | `waffo` \| `fake`，必填                                                                                                                |
| `WAFFO_MERCHANT_ID`、`WAFFO_PRIVATE_KEY`                                 | `PAYMENT_PROVIDER=waffo` 时必填；私钥用 `wrangler secret put` 设置                                                                     |
| `WAFFO_ENVIRONMENT`                                                      | `test` \| `prod`，默认 `test`；必须与 API Key 的环境一致，只有 Production 为 `prod`                                                    |
| `ADMIN_USER_IDS`                                                         | 可以使用管理台（`/api/admin/*`、web 的 `/admin`）的 user id，逗号分隔；未设置时没有管理员，见 [Admin Access](security.md#admin-access) |
| `DEEPSEEK_API_KEY`、`DEEPSEEK_MODEL`                                     | `TASK_PROVIDER=deepseek` 时必填；key 用 `wrangler secret put` 设置                                                                     |
| `ALLOW_FAKE_PROVIDERS`                                                   | 只有 E2E 设置为 `1`。Workers 没有 `NODE_ENV`，所以 `*_PROVIDER=fake` 一律需要它                                                        |

`apps/api/src/env.ts` 的 `apiEnv()` 用 zod 校验，错误只含变量名和规则。本地把变量写在 `apps/api/.dev.vars`（不提交）；Production 用 `wrangler secret put <NAME>` 或 Cloudflare 控制台设置。

---

## Worker

`apps/worker`（[jobs.md](jobs.md#termrise)）不读取 web 和 API 的变量，`apps/worker/src/env.ts` 只校验下表。本地放在 `apps/worker/.env`（模板 `apps/worker/.env.example`，`pnpm dev:worker` 用 `--env-file-if-exists` 读取）。

| 变量                   | 作用                                                                                                                    |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`         | 与 API 相同的数据库                                                                                                     |
| `WORKER_QUEUE`         | `bullmq`（默认，需要 `REDIS_URL`）或 `memory`（任务在进程内存中，只用于 E2E）                                           |
| `REDIS_URL`            | BullMQ 的 Redis。本地 `redis://localhost:63790/0`（`docker compose up -d redis`），Production 为 Upstash 的 `rediss://` |
| `SCAN_INTERVAL_MS`     | 扫描排队中的研究运行的间隔，默认 5000                                                                                   |
| `HACKER_NEWS_ENABLED`  | `1` 时每 `TREND_INTERVAL_MS` 采集一次 Hacker News 到 Radar（公开 API，不需要 Key）；不设置时不采集                      |
| `TREND_INTERVAL_MS`    | Radar 的采集间隔，默认 3600000（1 小时），最少 60000                                                                    |
| `PORT`                 | 健康检查端口（`GET /health`），默认 8080                                                                                |
| `KEYWORD_PROVIDER`     | 研究运行的关键词数据来源；现在只有 `fake`（需要 `ALLOW_FAKE_PROVIDERS=1`）                                              |
| `ANALYST_PROVIDER`     | 机会分析的来源；现在只有 `fake`（需要 `ALLOW_FAKE_PROVIDERS=1`）                                                        |
| `ALLOW_FAKE_PROVIDERS` | `1` 时允许 fake Provider（编造数据），只用于测试和本地开发                                                              |

校验错误只包含变量名和规则，不输出值。没有可用的 Worker 时，研究运行停在「排队中」。

---

## Local Development

本地跑通全部服务（web、API、Worker）：

1. 启动容器：`docker compose up -d postgres redis`。
2. 执行 migration：`DATABASE_URL=postgresql://postgres:postgres@localhost:54330/termrise_local pnpm db:migrate`。
3. 准备变量：`apps/web/.env.local`（`APP_URL`、`NEXT_PUBLIC_API_URL=http://localhost:3001`、`GOOGLE_CLIENT_ID`、`SENTRY_DSN`，本地可用 `https://sentry.invalid/1`）；`apps/api/.dev.vars`（见 [API Bindings](#api-bindings)，本地可用 `STORAGE_PROVIDER=fake`、`PAYMENT_PROVIDER=fake`、`ALLOW_FAKE_PROVIDERS=1`）；`apps/worker/.env`（从模板复制）。`APP_URL` 在 web 和 API 中必须相同。
4. 启动 API：在 shell 中设置 `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE`（指向 `termrise_local`；wrangler 只从 shell 环境读取它），再运行 `pnpm dev:api`。
5. 启动 web：`pnpm dev`（端口 3000 被占用时，Next.js 改用其他端口；这时用 `pnpm --filter web exec next dev --port <端口>` 固定端口，并把 `APP_URL` 改为该端口）。
6. 启动 Worker：`pnpm dev:worker`。
7. 登录：`DATABASE_URL=<本地库> pnpm dev:login --email you@example.com` 打印一个 Magic Link，在浏览器中打开即登录，不需要 Resend。脚本只接受 `localhost` 的数据库。用真实邮件登录时，按 overview.md 的 Email 一节设置 Resend。
