# Testing Strategy

## Testing Strategy

测试金字塔：

```text
Unit
↑
Integration
↑
E2E
↑
Production Smoke
```

核心 Domain：

```text
Credits
Task 扣费与退款
Billing
Webhook Idempotency
```

必须优先 Unit / Integration Test。

Integration Test 连接真实 PostgreSQL，不得 mock 数据库来测试事务和并发：

```text
本地：docker compose up -d postgres（所有 worktree 共用一个容器，固定 compose project 名与端口）

CI：GitHub Actions PostgreSQL service container
```

- Docker Compose project 名为 `saas-starter`，端口 `54330`。新产品可以改名和换端口，避免与其他项目的容器冲突。
- 每个 worktree 使用独立的测试库 `app_test_{topic}`（来自 `TEST_DATABASE_URL`），测试启动时自动创建并执行 migration，避免多个 worktree 并行跑测试时互相清表。本地 `TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:54330/app_test_{topic}`。库名只能包含 `[a-z0-9_]`。
- 测试会清空数据表，因此 test harness（`packages/db/src/testing/test-database.ts`）校验 `TEST_DATABASE_URL` 的 host 是 `localhost` / `127.0.0.1` / `::1` / `postgres`，否则拒绝运行，防止误连 Neon。

Vitest 分为两个 project：

| Project       | 文件                                              | 说明                                                                                                      |
| ------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `unit`        | `*.test.ts`、`*.test.mjs`（不含 `*.int.test.ts`） | 不连接数据库                                                                                              |
| `integration` | `*.int.test.ts`                                   | globalSetup 建库并执行 migration；文件串行执行；每个文件在 `beforeEach` 中自己调用 `resetDb()` 清空数据表 |

Vitest 配置只有一份（仓库根目录 `vitest.config.mts`），收集 `apps/*`、`packages/*`、仓库根目录和 `.claude/skills/`（项目 Skill 的脚本测试，即 `*.test.mjs`）中的测试；`.agents/skills/` 链接到 `.claude/skills/`（供 Codex 使用），所以排除 `.agents/`，避免同一测试运行两次；单元测试与被测文件放在一起。`pnpm test` 运行全部，`pnpm test:unit` / `pnpm test:integration` 分别运行。`pnpm test:coverage` 运行全部并统计覆盖率（不含 E2E），HTML 报告在 `coverage/index.html`。测试数据库工具位于 `packages/db/src/testing/`（`testDb`、`resetDb`、迁移用的 `global-db.ts`）；E2E 的登录、环境与 FakeStorage 工具位于 `apps/web/tests/setup/`。

- Docker PostgreSQL 的主版本与 Neon 项目保持一致。

Provider API 不允许在普通测试中真实调用。

使用：

```text
FakeAiProvider（大写输入；输入含 [fail] 时抛错，用来测退款）

FakePaymentProvider

FakeAnalyticsProvider（测试中保存事件；应用在未设置 NEXT_PUBLIC_POSTHOG_KEY 时用空实现）

FakeStorage（内存或文件目录）
```

通过环境变量在 E2E 环境中切换到 Fake Provider：

```text
TASK_PROVIDER=fake | example | deepseek

PAYMENT_PROVIDER=fake | waffo

STORAGE_PROVIDER=fake | r2
```

E2E 中 `STORAGE_PROVIDER=fake`：签名 URL 指向 `fake-storage.test`，对象以文件存放在 `FAKE_STORAGE_DIR`（`.e2e-storage/`）。浏览器对这些 URL 的 PUT / GET 由 Playwright 拦截并读写同一目录（`apps/web/tests/setup/fake-storage.ts`）。E2E 的环境变量在 `apps/web/tests/setup/e2e-env.ts`。

Production 环境禁止使用 Fake Provider，`packages/config/src/env.ts` 在 `serverEnv()` 首次调用时校验：`VERCEL_ENV=production` 时一律禁止；其他生产构建需要 `ALLOW_FAKE_PROVIDERS=1`。E2E 用 `next start`（生产构建），所以 `e2e-env.ts` 设置了这个变量。

示例付费操作的测试：

- `apps/web/src/features/tasks/task-service.int.test.ts`：真实 PostgreSQL 上的扣费、请求幂等（并发重试只扣一次）、失败退款、余额不足、输入校验和归属。
- `apps/web/tests/e2e/dashboard.spec.ts`：新用户的初始 Credits 和余额更新、中文界面、未登录跳转；任务扣 1 Credit、失败退款；余额不足时引导购买；`/dashboard` 和 `/billing` 首次加载时退款超时任务并显示退款后的余额；伪造的 session cookie 跳转到登录页。

替换示例功能时，保留这些场景：扣费、重试不重复扣费、失败退款、余额不足时不留下记录。

真实 Provider 只在手动脚本中调用，不进入普通测试与 CI。Production Smoke 和 Smoke Test 尚未定义和实现。

E2E 在 CI 中先 `pnpm build`，再由 Playwright 启动 `pnpm --filter web start --port 3100`，分 desktop（Desktop Chrome）和 mobile（Pixel 7）两个 project 运行。

本地运行 E2E 时，构建命令与 CI 一致：

```bash
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:54330/app_test_{topic}_e2e \
NEXT_PUBLIC_POSTHOG_KEY=phc_e2e_test pnpm build

TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:54330/app_test_{topic}_e2e \
pnpm test:e2e
```

- `NEXT_PUBLIC_POSTHOG_KEY` 在构建时写入浏览器代码。没有它，页面不显示 Cookie 横幅，`analytics.spec.ts` 失败。测试中浏览器发往 `/ingest` 的请求被拦截，不发到 PostHog；服务端在 `e2e-env.ts` 中把这个变量设为空，不发送服务端事件。
- 建议 E2E 使用单独的测试库（例如 `app_test_{topic}_e2e`）：集成测试会清空数据表，两者同时运行时会互相影响。

---
