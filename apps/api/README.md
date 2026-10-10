# api

模块化单体的 HTTP API（Hono），部署在 Cloudflare Workers，经 Hyperdrive 连接 Neon。决策见 `docs/adr/012-api-modular-monolith.md`，部署见 [API](../../docs/architecture/deployment.md#api)。

```bash
# 本地：wrangler dev 在 3001 端口启动，直接连接这个数据库
CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE=postgresql://… pnpm dev:api
pnpm --filter api build    # wrangler deploy --dry-run：只打包
pnpm --filter api run deploy
```

| 文件                              | 内容                                                        |
| --------------------------------- | ----------------------------------------------------------- |
| `wrangler.jsonc`                  | Worker 配置：`nodejs_compat`、Hyperdrive binding            |
| `src/index.ts`                    | Worker 入口：给每个请求加 requestId，交给 `createApp()`     |
| `src/app.ts`                      | `createApp()`：组装 `/api/*` 路由和错误处理，测试直接调用它 |
| `src/env.ts`                      | Binding 类型（`c.env`）                                     |
| `src/routes/health.ts`            | `GET /api/health`：每请求连接一次数据库，失败返回 503       |
| `src/middleware/error-handler.ts` | 把 `AppError` 转成与 web 相同的错误响应                     |
| `src/testing/worker.ts`           | 测试用的 binding 和 ExecutionContext                        |

新增路由调用 `packages/*` 中的 Service，不复制业务规则。数据库连接用 `connectDb()`，响应后用 `c.executionCtx.waitUntil()` 关闭。见 [Monorepo](../../docs/architecture/overview.md#monorepo) 和 [api.md](../../docs/architecture/api.md)。
