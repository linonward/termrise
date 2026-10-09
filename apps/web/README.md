# web

Next.js 应用，唯一部署到 Vercel 的应用（Root Directory 设为 `apps/web`）。安装、环境变量和启动步骤见根目录的 [README.md](../../README.md)。

## 目录

| 路径                  | 内容                                                                                                                                            |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app/`            | 路由：`(marketing)`、`(auth)`、`(dashboard)`、`admin`、`api`                                                                                    |
| `src/features/tasks/` | 示例付费操作（TaskService、组装、页面组件），产品替换为自己的功能                                                                               |
| `src/components/`     | 页面组件；平台能力的 UI 按领域分目录（`billing/`、`auth/`、`admin/`）                                                                           |
| `src/server/`         | 读取 env、组装单例（`getXService()`）；admin、credits、http、email                                                                              |
| `src/i18n/`           | next-intl 配置                                                                                                                                  |
| `messages/`           | 用户可见文案（`en.json`、`zh.json`）                                                                                                            |
| `scripts/`            | `pnpm admin:adjust`、`pnpm admin:export-user`、`pnpm admin:delete-user`、`pnpm waffo:products`、`pnpm indexnow`、`pnpm seo:validate` 等运维脚本 |
| `tests/`              | Playwright E2E 与测试 setup                                                                                                                     |

## 代码放在哪里

| 代码                                                                     | 位置                                                                                                     |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| 产品要整体替换的业务功能（示例 Task）：Service、组装、页面组件           | `src/features/<name>/`，替换时改或删这个目录，并改 `src/server/product.ts`、`src/server/product-data.ts` |
| 可复用的平台能力（billing、credits、auth、analytics、storage）的业务规则 | `packages/*`                                                                                             |
| 平台能力在本应用中的组装（读取 env、`getXService()`）                    | `src/server/<domain>/`                                                                                   |
| 平台能力的 UI                                                            | `src/components/<domain>/`                                                                               |
| 只有本应用使用的内部功能（管理台）                                       | Service 在 `src/server/admin/`，UI 在 `src/components/admin/`                                            |
| 跨领域的小工具                                                           | `src/lib/`（客户端可用）、`src/server/http/`（Route Handler 用）                                         |

平台能力不放进 `src/features/`：放在那里会被当作要替换的示例。平台代码（`src/server/`、`src/components/`）不导入 `src/features/`，只经 `src/server/product.ts`（删除与导出账号时经 `src/server/product-data.ts`）读取 Feature（ESLint 检查）。产品的功能需要 `apps/worker` 也调用时，把它的 Service 移到 `packages/<domain>`。

## 规则

- 平台能力的业务规则放在 `packages/*`，这里只做装配、路由和页面。产品功能的规则可以在 `src/features/<name>/` 中，但同一条规则不在两个应用中实现。见 [Monorepo](../../docs/architecture/overview.md#monorepo)。
- Route Handler 和 Server Component 只经 Service 访问数据库和第三方。见 [Architecture Rules](../../docs/architecture/overview.md#architecture-rules)。
- 用到新的 `@repo/*` 包时，加到 `next.config.ts` 的 `transpilePackages`。
- API 路由与错误码见 [api.md](../../docs/architecture/api.md)，页面与文案见 [ux.md](../../docs/product/ux.md)。
