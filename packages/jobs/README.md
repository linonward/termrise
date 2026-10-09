# @repo/jobs

后台任务队列接口和内存适配器。

| 子路径                       | 内容                                          |
| ---------------------------- | --------------------------------------------- |
| `@repo/jobs/queue`           | `JobQueue`、`JobConsumer`、`JobHandlers` 接口 |
| `@repo/jobs/job-types`       | `JobPayloads`：任务名到 payload 类型的映射    |
| `@repo/jobs/adapters/memory` | 内存适配器，只用于测试                        |

还没有持久化队列适配器。`apps/worker` 运行任务前需要先加一个，见 [jobs.md](../../docs/architecture/jobs.md)。

包的规则（子路径导入、不读取 env、不依赖 `apps/*`）见 [Monorepo](../../docs/architecture/overview.md#monorepo)。
