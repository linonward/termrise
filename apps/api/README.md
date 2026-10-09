# api

可选的独立 HTTP API（Hono），目前是骨架：只有 `/health` 和共用的错误契约。Production 不部署，没有部署配置。

```bash
pnpm dev:api   # 在 3001 端口启动（PORT 可覆盖）
```

| 文件                              | 内容                                              |
| --------------------------------- | ------------------------------------------------- |
| `src/index.ts`                    | 启动 Node 服务                                    |
| `src/app.ts`                      | `createApp()`：组装路由和错误处理，测试直接调用它 |
| `src/routes/health.ts`            | `GET /health`                                     |
| `src/middleware/error-handler.ts` | 把 `AppError` 转成与 web 相同的错误响应           |

新增路由调用 `packages/*` 中的 Service，不复制 web 的业务规则。见 [Monorepo](../../docs/architecture/overview.md#monorepo) 和 [api.md](../../docs/architecture/api.md)。
