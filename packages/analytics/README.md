# @repo/analytics

PostHog 产品事件、Cookie 同意和 Vercel Web Analytics 的 URL 脱敏。

| 子路径                                  | 内容                                                    |
| --------------------------------------- | ------------------------------------------------------- |
| `@repo/analytics/client`                | 浏览器端：用户同意后初始化 PostHog，`track`、`identify` |
| `@repo/analytics/consent`               | Consent Cookie 的名称与读取                             |
| `@repo/analytics/analytics-service`     | 服务端事件 `createAnalyticsService()`                   |
| `@repo/analytics/types`                 | `AnalyticsProvider` 接口与事件类型                      |
| `@repo/analytics/adapters/posthog-node` | PostHog 服务端适配器                                    |
| `@repo/analytics/adapters/fake`         | 测试用适配器                                            |
| `@repo/analytics/web-analytics`         | Web Analytics 事件的 URL 脱敏                           |

事件不记录 Secret、完整 Prompt、Email，见 [observability.md](../../docs/architecture/observability.md)。

包的规则（子路径导入、不读取 env、不依赖 `apps/*`）见 [Monorepo](../../docs/architecture/overview.md#monorepo)。
