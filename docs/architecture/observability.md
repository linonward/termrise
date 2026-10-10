# Analytics & Observability

## Analytics

PostHog 客户端事件（`packages/analytics/src/client.ts` 的 `AnalyticsEvent`）：

```text
landing_viewed

pricing_viewed

signup_started

dashboard_viewed

task_started

checkout_started

credits_exhausted
```

服务端事件（`packages/analytics/src/types.ts` 的 `ServerAnalyticsEvent`）：

```text
signup_completed

purchase_completed

task_succeeded

task_failed
```

`task_*` 是示例付费操作的事件。新产品替换示例功能时，同时改事件名，并更新这两个类型。

通用属性：

```text
product_id

locale
```

所有产品共用一个 PostHog Project，用 `product_id` 区分：

- 值为 `product.config.ts` 的 `id`。应用把它传给 `initAnalytics(key, { productId })` 和 `createAnalyticsService({ productId })`，包不读取 `product.config.ts`。
- 客户端 `track` 和服务端 `capture` 在每个事件上写入 `product_id`，调用方传入的同名属性被覆盖。
- PostHog 自动产生的事件（例如 `identify` 产生的 `$identify`）不带 `product_id`。
- 每个 Insight 和 Dashboard 都必须按 `product_id` 过滤，否则数据混入其他产品。
- 免费额度、Project 设置（autocapture、Session Replay、数据保留）由所有产品共享。
- 各产品的用户 id 来自各自的数据库，同一个人在两个产品中是两个 PostHog 用户。

客户端事件的 `locale` 由 `track` 从 `<html lang>` 读取（当前界面语言）。`identify` 时也把 `locale` 写入 PostHog 用户属性。

服务端事件：`signup_completed` 的 `locale` 从注册请求读取（`NEXT_LOCALE` Cookie → `Accept-Language`）。`purchase_completed` 来自 Webhook，`task_*` 不带 `locale`；分析时按用户属性 `locale` 拆分（值为该用户最近一次 `identify` 时的界面语言）。users 表不存语言：目前只有 Analytics 需要它。以后如果要在用户请求以外的场景按用户语言发送内容（例如邮件），再加字段。

`task_started` 带 `inputLength`（输入长度），不带输入内容。`credits_exhausted` 在 `POST /api/tasks` 返回 `INSUFFICIENT_CREDITS` 时发送。

`signup_completed`、`purchase_completed` 和 `task_succeeded` / `task_failed` 从服务端发送。其余事件从客户端发送。

用户标识使用内部 user id。

不得发送：

```text
full prompt
email
payment payload
API secrets
```

除非明确确认隐私策略允许。

Cookie 同意（方案 B）：

```text
posthog-js 以 opt_out_capturing_by_default + opt_out_persistence_by_default 初始化：同意前不发送事件，不写 Cookie / localStorage
Cookie 横幅（apps/web/src/components/analytics/cookie-banner.tsx）：Accept → opt_in_capturing，Decline → opt_out_capturing
同意状态存在第一方 Cookie cookie_consent（"1" 同意 / "0" 拒绝），服务端也可读取
Footer 的 Cookie settings 重新打开横幅
不启用 autocapture、自动 pageview、session recording
请求经同源 /ingest 代理到 PostHog US（apps/web/next.config.ts rewrites）
```

客户端事件由 `packages/analytics/src/client.ts` 的 `track` 发送；`identify` 使用内部 user id，Logout 时 `reset`。

`posthog-js` 用动态 `import()` 加载，不进入任何页面的首屏 JS。Consent Cookie 为“接受”时，页面加载后立即加载 SDK；访客点击横幅按钮或 Cookie settings 时，加载 SDK 来写入或清除选择。没有选择或已拒绝时不下载 SDK，横幅是否显示由 Cookie 判断，`track` 和 `identify` 被丢弃。`client.ts` 记住最近一次 `identify` 的 user id：已登录用户在当前页面点 Accept 时，SDK 加载并 `opt_in_capturing()` 后立即再 `identify` 一次，之后的事件属于该用户，不用刷新页面。SDK 加载完成前的 `track` 和 SDK 调用会在加载后按顺序执行；组件只通过 `packages/analytics/src/client.ts` 调用 SDK，不直接 import `posthog-js`。

服务端事件在响应发出后才执行（`apps/api` 的 `c.var.defer()`，经 `waitUntil()`，同意状态查询也在其中），不增加 webhook、注册和 API 的响应时间。

服务端事件（`packages/analytics/src/analytics-service.ts`，装配在 `apps/api/src/analytics.ts`，AnalyticsService → AnalyticsProvider → posthog-node `captureImmediate`）：

```text
signup_completed       应用的 onUserCreated（Better Auth user.create.after 调用）；注册请求带 cookie_consent 时先写入 analytics_consents
purchase_completed     BillingService：PENDING → PAID 的事务提交后，每个 Purchase 一次
task_succeeded         TaskService：Provider 返回结果后（带 taskId）
task_failed            TaskService：Provider 抛出错误后（带 taskId，不带错误信息）；超时清理不发送
```

- 只发给 `analytics_consents.granted = true` 的用户（见 [data-model.md · analytics_consents](data-model.md#analytics_consents)）；webhook 请求没有浏览器 Cookie，所以同意状态存在数据库。
- 写入：登录用户点 Accept / Decline → `apps/api` 的 `POST /api/analytics/consent`（`initAnalytics()` 的 `apiUrl`，带 cookie）；未登录时做的选择在下次进入 Dashboard 时同步。
- 发送失败只记 `analytics.capture_failed`（warn），不影响业务流程。
- `apps/api` 未设置 `POSTHOG_KEY` 时，服务端使用空实现，丢弃事件，仍保存同意状态（`apps/api/src/analytics.ts`）。测试使用 Fake Provider，它在内存中保存事件。

### Web Analytics

用途：统计每个页面的访问量和流量来源（来源网站、`utm_*` 参数），回答"哪个渠道带来访客"。PostHog 只在用户同意 Cookie 后发送，看不到大部分访客的来源，所以另用 Vercel Web Analytics。

- 不使用 Cookie，不识别个人，不需要 Cookie 同意；隐私政策的 Cookies 小节写明采集内容（[Privacy and Compliance](https://vercel.com/docs/analytics/privacy-policy)）。
- `apps/web/src/components/analytics/web-analytics.tsx` 在根 layout 中渲染，只在 Vercel 部署上加载（`VERCEL=1`）；本地和 E2E 不加载。
- `beforeSend` 为 `redactEvent()`，它调用 `redactUrl()`（`packages/analytics/src/web-analytics.ts`）：只保留路径和 `utm_*` 参数，路径中的 UUID 换成 `[id]`。
- 只统计访问，不统计注册和付费。按渠道看注册与付费需要在注册时记录来源，尚未实现。
- 推广链接统一加 `utm_source` / `utm_medium` / `utm_campaign`，例如 `?utm_source=newsletter&utm_medium=email&utm_campaign=launch`。
- 需要在 Vercel 项目 → Analytics 中启用；未启用时脚本加载但不记录。

### Speed Insights

用途：按页面统计真实访客的 Real Experience Score（RES），发现慢页面。

- 不使用 Cookie，不识别个人，不需要 Cookie 同意；采集内容见 [Speed Insights Privacy & Compliance](https://vercel.com/docs/speed-insights/privacy-policy)（路由、URL、网络类型、浏览器、设备类型、操作系统、国家、Web Vital 及其归因元素），隐私政策的 Cookies 小节写明。
- `apps/web/src/components/analytics/speed-insights.tsx` 与 Web Analytics 一起在根 layout 中渲染，只在 Vercel 部署上加载（`VERCEL=1`）。
- `beforeSend` 与 Web Analytics 共用 `redactEvent()`（`packages/analytics/src/web-analytics.ts`），URL 同样只保留路径和 `utm_*` 参数。
- 需要在 Vercel 项目 → Speed Insights 中启用；未启用时不记录。
- 只使用免费版，不开启 Speed Insights Plus。免费版没有项目费用和事件费用，整个 team 在滚动 30 天内共享 10,000 个事件，超出后暂停采集至少 14 天，不收费；只显示 RES 和按路径的 Great / Needs Improvement 统计。Plus 按项目和事件另外收费，价格以 Vercel 当前页面为准。需要 LCP、INP 等单项指标时，先评估流量和费用。见 [Limits and Pricing](https://vercel.com/docs/speed-insights/limits-and-pricing)。

---

## Observability

Sentry 捕获：

```text
Unhandled Exception

Provider Error

Payment Error

Webhook Error

Storage Error

Task Failure

Partial Purchase Reversal
```

Structured Log 在有值时包含下列字段（例如 `task.stale` 没有 `userId`，请求以外的调用没有 `requestId`）。日志的 `requestId` 来自 `x-vercel-id`（没有时生成 UUID），与 Task 的幂等 `requestId` 不是同一个值。

```text
requestId

userId

taskId

purchaseId

eventType
```

禁止记录 Secrets。

禁止记录完整 Prompt 和 Email。

数据库查询失败时，Drizzle 的错误信息带有 SQL 参数值（可能含 email、prompt）。`logger` 和服务端、edge 的 Sentry `beforeSend` 都会去掉 `params:` 部分（客户端 Sentry 没有设置），只保留带 `$n` 占位符的 SQL（`packages/observability/src/scrub-query-params.ts`）。

实现：`packages/observability/src/logger.ts`

```text
logger.info / warn / error(eventType, fields)，每条日志一行 JSON：level、time、eventType、requestId + fields

eventType 用 {领域}.{事件}，例如 task.failed、billing.refund_shortfall、webhook.payment_failed

requestId：API 路由用 withRequestContext 包住 handler；取 Vercel 的 x-vercel-id，没有则生成 UUID

字段名为 email、prompt、apiKey、token、secret、password、authorization、cookie 时，值写成 [redacted]

error 字段序列化为 name、message、code、stack
```

`apps/*/src/` 和 `packages/*/src/` 中禁止直接使用 `console`（ESLint `no-console`），测试和 `logger.ts` 除外。

Sentry 接入（`@sentry/nextjs`）：

```text
client：apps/web/src/instrumentation-client.ts（NEXT_PUBLIC_SENTRY_DSN），经 /monitoring 隧道上报
server / edge：apps/web/src/sentry.server.config.ts、apps/web/src/sentry.edge.config.ts（SENTRY_DSN），由 apps/web/src/instrumentation.ts 加载
未捕获的请求错误：onRequestError；渲染错误：apps/web/src/app/global-error.tsx
logger.error 同时上报 Sentry：eventType 和 requestId 作为 tag，其余字段（已脱敏）作为 extra
不启用 Replay / Feedback；不设置 sendDefaultPii
source maps：build 时有 SENTRY_AUTH_TOKEN 才上传
```

上表各类错误对应的 eventType：Provider / Task Failure → `task.failed`、`task.stale`（warn，超时清理）；Payment → `billing.checkout_failed`；Webhook → `webhook.payment_failed`；Partial Purchase Reversal（Credit Pack 和订阅付款的退款都算）→ `billing.refund_shortfall`；Payment after Expiry → `billing.late_payment`（warn）；Payment for Refunded Purchase → `billing.payment_for_non_pending_purchase`（Purchase 已退款后又收到付款，需要人工处理）；Subscription → `billing.unknown_subscription`（warn）、`billing.replaced_subscription_paid`、`billing.cancel_failed`；Unhandled → `http.unhandled_error`、`onRequestError`、`auth.unhandled_error`（`/api/auth/*` 中的非 APIError；只记录错误名称、code 和调用栈，不记录 message，因为失败查询的 message 带参数，可能含 Email）、`admin.adjust_failed`（`/admin` 调整 Credits 时的非 AdminError）。标为 warn 的事件只写日志，不上报 Sentry：只有 `logger.error` 上报。数据库不可用时 `/api/health` 记 `health.database_unavailable`（warn）。`apps/api` 中响应后执行的任务（`c.var.defer()`，例如服务端 Analytics 事件）失败时记 `http.deferred_failed`。Storage 目前没有专用的 eventType：签名 URL 在本地计算，失败时记为 `http.unhandled_error`。新产品加入存储读写时，用 `storage.*` 记录。

---

## Uptime Monitoring

Sentry 只在请求出错时上报。站点完全无法访问时没有请求，也就没有报错，所以需要外部的 uptime 监控。Starter 不选定服务商：每个产品选一个支持 HTTP 检查和告警的服务。

有两个检查地址，都要监控：web 的 `GET /api/health`（`apps/web/src/app/api/health/route.ts`）只说明页面能响应，总是返回 200 `{ "status": "ok" }`；`apps/api` 的 `GET /api/health`（`apps/api/src/routes/health.ts`，检查在 `packages/db/src/health.ts`）检查数据库：

- 不需要登录，不限流，`Cache-Control: no-store`。
- 在 3 秒内执行数据库 `select 1`：成功返回 200 `{ "status": "ok" }`，失败或超时返回 503 `{ "status": "error" }`。响应不包含失败原因，原因写在日志 `health.database_unavailable` 中。
- 每次检查执行一次查询。检查间隔不短于 1 分钟。

在 uptime 服务中设置：

| 项目     | 值                                                |
| -------- | ------------------------------------------------- |
| URL      | `https://<domain>/api/health`                     |
| 方法     | GET，状态码不是 200 即失败                        |
| 间隔     | 1–5 分钟                                          |
| 告警条件 | 连续 2 次失败（避免冷启动或网络抖动误报）         |
| 告警渠道 | 维护者的 email 和手机推送；不要只发到不常看的渠道 |

上线前在 uptime 服务中触发一次测试告警，确认能收到。`apps/api` 部署后，同样监控它的 `GET /api/health`（`apps/api/src/routes/health.ts`）：规则相同，数据库检查共用 `packages/db/src/health.ts`，连接超时为 5 秒。
