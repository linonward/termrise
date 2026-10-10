# api

模块化单体的 HTTP API（Hono），部署在 Cloudflare Workers，经 Hyperdrive 连接 Neon。决策见 `docs/adr/012-api-modular-monolith.md`，部署见 [API](../../docs/architecture/deployment.md#api)。

```bash
# 本地：变量写在 .dev.vars（不提交）；wrangler dev 在 3001 端口启动，直接连接这个数据库
CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE=postgresql://… pnpm dev:api
pnpm --filter api build    # wrangler deploy --dry-run：只打包
pnpm --filter api run deploy
```

| 文件                                              | 内容                                                                                     |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `wrangler.jsonc`                                  | Worker 配置：`nodejs_compat`、Hyperdrive binding                                         |
| `src/index.ts`                                    | Worker 入口：给每个请求加 requestId，交给 `createApp()`                                  |
| `src/app.ts`                                      | `createApp()`：组装 `/api/*` 路由和错误处理，测试直接调用它                              |
| `src/env.ts`                                      | Binding 类型与 `apiEnv()` 校验                                                           |
| `src/middleware/database.ts`                      | 每请求一个连接（`c.var.db`）；响应和 `c.var.defer()` 的任务结束后关闭                    |
| `src/routes/health.ts`                            | `GET /api/health`：连接一次数据库，失败返回 503                                          |
| `src/routes/auth.ts`                              | Better Auth（`/api/auth/*`）：CORS、cookie                                               |
| `src/routes/tasks.ts`                             | `GET` / `POST /api/tasks`：示例付费操作                                                  |
| `src/routes/uploads.ts`                           | `POST /api/uploads`：签名 R2 直传 URL                                                    |
| `src/routes/analytics.ts`                         | `POST /api/analytics/consent`：登录用户的 Cookie 横幅选择                                |
| `src/routes/checkout.ts`、`src/routes/billing.ts` | Checkout、购买列表、Credit 明细、取消订阅                                                |
| `src/routes/webhooks.ts`                          | `POST /api/webhooks/waffo`：Provider 调用，没有 CORS 和 session                          |
| `src/billing.ts`                                  | 按 binding 选择支付 Provider，组装 BillingService                                        |
| `src/routes/credits.ts`                           | `GET /api/credits/balance`：先退款超时 Task 再读余额                                     |
| `src/tasks.ts`、`src/product.ts`                  | 组装 TaskService；平台路由读取示例付费操作的唯一入口（`beforeBalanceRead`）              |
| `src/routes/admin.ts`、`src/middleware/admin.ts`  | 管理台 API：只给 `ADMIN_USER_IDS`，其他用户 404                                          |
| `src/product-data.ts`                             | 删除与导出账号时的产品数据（admin 脚本也导入）                                           |
| `scripts/admin-*.ts`                              | `pnpm admin:adjust` / `admin:export-user` / `admin:delete-user`，直接连接 `DATABASE_URL` |
| `src/routes/user-routes.ts`                       | `userRoutes()`：已登录路由的 middleware 组合                                             |
| `src/storage.ts`、`src/http.ts`                   | 按 binding 选择存储适配器；`readJson()`                                                  |
| `src/auth.ts`、`src/analytics.ts`                 | 每个请求的 Better Auth（含登录邮件）与服务端 Analytics                                   |
| `src/middleware/web-cors.ts`                      | 只允许 web（`APP_URL`）跨域调用，带 cookie                                               |
| `src/middleware/web-csrf.ts`                      | form 与 `text/plain` 请求只接受 web 的 Origin                                            |
| `src/middleware/session.ts`                       | 已登录路由：`c.var.user`，未登录 401                                                     |
| `src/middleware/rate-limit.ts`                    | `rateLimit(name)`：`API_RATE_LIMITS` 的按用户限流                                        |
| `src/middleware/error-handler.ts`                 | 把 `AppError` 转成与 web 相同的错误响应                                                  |
| `messages/*.json`                                 | API 自己发送的文案（登录邮件）                                                           |
| `src/testing/worker.ts`                           | 测试用的 binding 和 ExecutionContext                                                     |
| `src/testing/client.ts`                           | `createTestClient()`：调用 app，`signIn()` 经 Magic Link 登录                            |

新增路由调用 `packages/*` 中的 Service，不复制业务规则。需要数据库的路由用 `database` middleware，从 `c.var.db` 取连接；已登录路由的 middleware 顺序见 [api.md](../../docs/architecture/api.md#api-surface)；Binding 经 `apiEnv(c.env)` 读取，见 [API Bindings](../../docs/architecture/environment.md#api-bindings)、[Monorepo](../../docs/architecture/overview.md#monorepo) 和 [api.md](../../docs/architecture/api.md)。
