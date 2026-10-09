# @repo/observability

结构化日志、`AppError` 与错误码、日志脱敏。

| 子路径                                   | 内容                                                          |
| ---------------------------------------- | ------------------------------------------------------------- |
| `@repo/observability/logger`             | `logger`、`withRequestContext()`、`setErrorReporter()`        |
| `@repo/observability/errors`             | `AppError`、`ERROR_STATUS`、`errorBody()`：API 共用的错误契约 |
| `@repo/observability/scrub-query-params` | 去掉 URL 查询参数，Sentry 事件脱敏                            |

日志不记录 Secret、完整 Prompt、Email，见 [observability.md](../../docs/architecture/observability.md)。错误码见 [api.md](../../docs/architecture/api.md)。

包的规则（子路径导入、不读取 env、不依赖 `apps/*`）见 [Monorepo](../../docs/architecture/overview.md#monorepo)。
