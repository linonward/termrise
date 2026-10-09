# worker

可选的后台任务 Worker，目前是骨架：处理 `@repo/jobs` 中定义的任务。没有部署配置。

还没有持久化队列适配器，所以 `src/index.ts` 启动后立即退出。先在 `@repo/jobs` 中加入一个 `JobConsumer` 适配器，再在入口调用 `startWorker(consumer)`。见 [jobs.md](../../docs/architecture/jobs.md)。

| 文件                                  | 内容                                                |
| ------------------------------------- | --------------------------------------------------- |
| `src/index.ts`                        | 入口                                                |
| `src/worker.ts`                       | `handlers`：任务名到处理函数的映射；`startWorker()` |
| `src/processors/example.processor.ts` | 示例任务 `example.echo`                             |

新增任务：在 `@repo/jobs/job-types` 中声明 payload，在 `src/processors/` 中实现，再加到 `handlers`。
