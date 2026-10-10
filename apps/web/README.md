# web

Next.js 应用，唯一部署到 Vercel 的应用（Root Directory 设为 `apps/web`）。安装、环境变量和启动步骤见根目录的 [README.md](../../README.md)。

## 目录

web 只渲染页面：数据经 `apps/api` 读写（[ADR-012](../../docs/adr/012-api-modular-monolith.md)）。

| 路径                  | 内容                                                                                                 |
| --------------------- | ---------------------------------------------------------------------------------------------------- |
| `src/app/`            | 路由：`(marketing)`、`(auth)`、`(dashboard)`、`admin`；`api/` 只有 `/api/health`                     |
| `src/features/tasks/` | 示例付费操作的页面组件（`TaskPanel`），产品替换为自己的功能                                          |
| `src/components/`     | 页面组件；平台能力的 UI 按领域分目录（`billing/`、`auth/`、`admin/`）                                |
| `src/server/`         | `api/`：服务端调用 `apps/api`；`auth/`：读取 session；`product.ts`；`http/csp.ts`                    |
| `src/lib/`            | 跨领域的小工具（客户端可用），包括浏览器调用 API 的 `apiFetch()`                                     |
| `src/i18n/`           | next-intl 配置                                                                                       |
| `messages/`           | 用户可见文案（`en.json`、`zh.json`）                                                                 |
| `scripts/`            | `pnpm waffo:products`、`pnpm indexnow`、`pnpm seo:validate` 等脚本；admin 脚本在 `apps/api/scripts/` |
| `tests/`              | Playwright E2E 与测试 setup                                                                          |

## 规则

- 不访问数据库，不导入 Service 和 Provider 适配器（类型除外），不新增 `/api/health` 以外的 Route Handler（ESLint 检查）。服务端用 `apiGet()` / `apiRequest()`，浏览器用 `apiFetch()`。见 [Architecture Rules](../../docs/architecture/overview.md#architecture-rules)。
- 业务规则放在 `packages/*`，API 在 `apps/api`。同一条规则不在两个应用中实现，见 [Monorepo](../../docs/architecture/overview.md#monorepo)。
- 平台代码（`src/server/`、`src/components/`）不导入 `src/features/`，只经 `src/server/product.ts` 读取 Feature（ESLint 检查）。
- 用到新的 `@repo/*` 包时，加到 `next.config.ts` 的 `transpilePackages`。
- API 路由与错误码见 [api.md](../../docs/architecture/api.md)，页面与文案见 [ux.md](../../docs/product/ux.md)。
