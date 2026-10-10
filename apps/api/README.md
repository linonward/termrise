# api

模块化单体的 HTTP API（Hono），部署在 Cloudflare Workers，经 Hyperdrive 连接 Neon。决策见 `docs/adr/012-api-modular-monolith.md`，部署见 [API](../../docs/architecture/deployment.md#api)。

```bash
# 本地：变量写在 .dev.vars（不提交）；wrangler dev 在 3001 端口启动，直接连接这个数据库
CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE=postgresql://… pnpm dev:api
pnpm --filter api build    # wrangler deploy --dry-run：只打包
pnpm --filter api run deploy
```

| 文件                              | 内容                                                                  |
| --------------------------------- | --------------------------------------------------------------------- |
| `wrangler.jsonc`                  | Worker 配置：`nodejs_compat`、Hyperdrive binding                      |
| `src/index.ts`                    | Worker 入口：给每个请求加 requestId，交给 `createApp()`               |
| `src/app.ts`                      | `createApp()`：组装 `/api/*` 路由和错误处理，测试直接调用它           |
| `src/env.ts`                      | Binding 类型与 `apiEnv()` 校验                                        |
| `src/middleware/database.ts`      | 每请求一个连接（`c.var.db`）；响应和 `c.var.defer()` 的任务结束后关闭 |
| `src/routes/health.ts`            | `GET /api/health`：连接一次数据库，失败返回 503                       |
| `src/routes/auth.ts`              | Better Auth（`/api/auth/*`）：CORS、cookie、登录邮件                  |
| `src/middleware/error-handler.ts` | 把 `AppError` 转成与 web 相同的错误响应                               |
| `messages/*.json`                 | API 自己发送的文案（登录邮件）                                        |
| `src/testing/worker.ts`           | 测试用的 binding 和 ExecutionContext                                  |

新增路由调用 `packages/*` 中的 Service，不复制业务规则。需要数据库的路由用 `database` middleware，从 `c.var.db` 取连接；Binding 经 `apiEnv(c.env)` 读取，见 [API Bindings](../../docs/architecture/environment.md#api-bindings)、[Monorepo](../../docs/architecture/overview.md#monorepo) 和 [api.md](../../docs/architecture/api.md)。
