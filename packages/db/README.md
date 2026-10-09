# @repo/db

Drizzle schema、Postgres client、migrations 和测试数据库工具。

| 子路径                | 内容                                                   |
| --------------------- | ------------------------------------------------------ |
| `@repo/db/schema`     | 全部表定义（`src/schema/`）                            |
| `@repo/db/client`     | `db()`：读取 `DATABASE_URL` 的进程内单例；`createDb()` |
| `@repo/db/testing/db` | 集成测试用 `testDb()`、`resetDb()`，只在测试中使用     |

```bash
pnpm db:generate   # 修改 schema 后生成 migration（migrations/）
pnpm db:migrate    # 对 DATABASE_URL 执行 migration
pnpm db:studio
```

`db()`、`testing/*` 和 `drizzle.config.ts` 读取 env，是“包不读取 env”规则的例外。表结构见 [data-model.md](../../docs/architecture/data-model.md)，migration 发布顺序见 [deployment.md](../../docs/architecture/deployment.md)。

包的规则（子路径导入、不读取 env、不依赖 `apps/*`）见 [Monorepo](../../docs/architecture/overview.md#monorepo)。
