# API Surface & Error Contract

## API Surface

只创建必要的 API。`apps/api` 的路由（`apps/api/src/routes/`）：

```text
GET /api/tasks?limit=（先把超时的 PENDING Task 改为 FAILED 并退款，再返回当前用户最近的 Task，新的在前；limit 为 1–20，默认 20）

POST /api/tasks（{ requestId, input }，示例付费操作，成功返回 201 + Task，见 tasks.md）

POST /api/uploads（{ contentType, size, extension }，返回签名上传 URL，见 storage.md）

POST /api/analytics/consent（{ granted: boolean }，登录用户的 Cookie 横幅选择，成功返回 204，见 observability.md）

GET /api/research/projects（当前用户的研究项目，新的在前，最多 50 个）

POST /api/research/projects（{ name, seeds, dataBudgetUsd?, aiBudgetUsd? }，成功返回 201 + 项目，见 data-model.md 的 Research Projects）

GET /api/research/projects/:id（不属于当前用户或不存在时 404 RESEARCH_PROJECT_NOT_FOUND）

PATCH /api/research/projects/:id（部分字段；不是 draft 或 budget_exhausted 时 409 RESEARCH_PROJECT_LOCKED）

DELETE /api/research/projects/:id（只删除 draft，成功返回 204）

POST /api/research/projects/:id/import（{ csv }：CSV 文本，最多 1,000,000 字符、1000 行；只导入 draft。返回 { imported, duplicates, rejectedCount, rejected: [{ line, reason }]（最多 20 条）, seedsAdded, seedsSkipped }；整个文件无效时 400 INVALID_INPUT，error.reason 为 empty / too_large / too_many_rows / missing_term_column）

GET /api/research/projects/:id/signals（项目的信号，观测时间新的在前，最多 200 条）

POST /api/research/projects/:id/runs（{ requestId }：把运行放入队列，返回 201 + 运行记录（status 为 pending），由 Worker 执行；同一个 requestId 返回同一次运行；项目不是 draft / failed / budget_exhausted 时 409 RESEARCH_PROJECT_LOCKED；预算不够一次扩词时运行为 failed，errorCode 为 BUDGET_EXHAUSTED）

POST /api/research/projects/:id/runs/:runId/cancel（取消 pending 或 running 的运行，返回 200 + 运行（status 为 cancelled），项目改为 cancelled，可以再运行；运行中的 Worker 在下一次付费调用前停止，已发出的调用照常结算；运行已结束时 409 RESEARCH_RUN_FINISHED，不存在时 404 RESEARCH_RUN_NOT_FOUND）

GET /api/research/projects/:id/runs（运行记录，新的在前）

GET /api/research/projects/:id/keywords（关键词与最新指标，搜索量高的在前，没有数据的在后；指标缺失为 null）

GET /api/research/projects/:id/serps（每个已审核关键词最新的前 10 个结果）

GET /api/research/projects/:id/costs（{ data, ai }：每项 budgetUsd、spentUsd、heldUsd、remainingUsd；calls：最近 100 次付费调用；见 data-model.md 的 Budget Ledger）

GET /api/radar/items（Radar 条目，最多 100 个；?q= 按规范化的词搜索（不区分大小写，最多 100 字符），?sort=new（首次发现，默认）| score（分数高的在前，没有分数的在后）；任何登录用户看到同样的条目；每个条目带 `lifecycle`；见 data-model.md 的 Radar）

PUT / DELETE /api/radar/items/:id/star（收藏 / 取消收藏，返回 { starred }；`?starred=1` 时列表只列收藏；条目不存在时 404 RADAR_ITEM_NOT_FOUND）

GET /api/radar/items/:id（条目与观测记录（新的在前，最多 200 条）；不存在时 404 RADAR_ITEM_NOT_FOUND）

GET /api/settings/providers（{ worker, radar, usage }：Worker 的服务配置与是否在线（没有时为 null）、Radar 条目数与最近采集时间、当前用户的项目按服务和预算类型的调用数、失败数、spentUsd、heldUsd、最近一次调用的时间和状态；见 data-model.md 的 Worker Heartbeats）

GET /api/opportunities（当前用户的当前机会，分数高的在前；?projectId= 只列一个项目，不属于当前用户时返回空列表；见 data-model.md 的 Opportunities）

GET /api/opportunities/:id（机会、当前评估与证据：keywords、serps、signals，以及 decisions（新的在前）和 experiments；不属于当前用户或不存在时 404 OPPORTUNITY_NOT_FOUND）

GET /api/opportunities/:id/brief.md（Product Brief，`text/markdown; charset=utf-8`，`Content-Disposition: attachment; filename="brief-<组名>.md"`；见 data-model.md 的 Product Brief）

PUT / DELETE /api/opportunities/:id/star（收藏 / 取消收藏，返回 { starred }；`GET /api/opportunities?starred=1` 只列收藏；不属于当前用户时 404 OPPORTUNITY_NOT_FOUND）

POST /api/opportunities/:id/decisions（{ decision, reason }，成功返回 201；当前状态不允许时 409 OPPORTUNITY_DECISION_INVALID；见 data-model.md 的 Decisions and Experiments）

POST /api/opportunities/:id/experiments（{ kind, hypothesis, channel, metric, budgetUsd, durationDays, successThreshold, stopCondition }，成功返回 201 + 实验）

PATCH /api/opportunities/:id/experiments/:experimentId（{ status, resultNote? }；passed / failed 需要 resultNote；不存在时 404 EXPERIMENT_NOT_FOUND，已结束时 409 EXPERIMENT_FINISHED）

GET /api/execution/projects（当前用户的产品，新的在前；?opportunityId= 只列这个机会的产品）

POST /api/execution/projects（{ opportunityId, name? }：开始 Go 机会的产品，返回 201；同一个机会再次请求返回同一个产品；机会不是 go 时 409 EXECUTION_NEEDS_GO；见 data-model.md 的 Execution and Revenue）

GET /api/execution/projects/:id（产品、events、revenue 与 totals；不属于当前用户或不存在时 404 EXECUTION_PROJECT_NOT_FOUND）

PATCH /api/execution/projects/:id（{ name?, status?, launchedOn?, domain?, repoUrl? }；launched / measuring 没有上线日期时 400 INVALID_INPUT）

POST /api/execution/projects/:id/events（{ metric, count, periodStart, periodEnd, note? }，返回 201）

POST /api/execution/projects/:id/revenue（{ occurredOn, currency, orders, gross, refund?, fees?, evidence?, note? }：金额用主单位，最多两位小数；fees 省略或 null 表示未知；返回 201，source 总是 manual）

DELETE /api/execution/projects/:id/events/:recordId、DELETE /api/execution/projects/:id/revenue/:recordId（只删除 manual 记录，返回 204；否则 404 EXECUTION_RECORD_NOT_FOUND）

GET /api/credits/balance（先把超时的 PENDING Task 改为 FAILED 并退款，再返回 { balance }，见 tasks.md 的 Stale Tasks）

POST /api/checkout（{ packId } 或 { planId }，成功返回 201 { checkoutUrl }；已有已付款订阅时 { planId } 返回 409 SUBSCRIPTION_EXISTS，见 billing.md 的 Subscriptions）

GET /api/billing/purchases（先把超过 60 分钟的 PENDING 购买改为 FAILED，见 Pending Expiry，再返回当前用户的购买记录）

GET /api/billing/credit-activity?cursor=（Credit 明细，每页 20 条）

GET /api/billing/subscription（{ subscription: { planId, status, currentPeriodEnd } | null, customerPortalUrl }）

GET /api/billing/subscription/checkout-status（订阅 Checkout 之后：{ checkout: { granted } | null }，最新的订阅是否已发放 Credits）

POST /api/billing/subscription/cancel（取消当前订阅，返回 200 { status, currentPeriodEnd }；没有可取消的订阅返回 404 SUBSCRIPTION_NOT_FOUND，见 billing.md 的 Cancel Subscription）

POST /api/webhooks/waffo（Waffo 调用，见 billing.md）

GET /api/admin/session（管理员 204，否则 404；以下 /api/admin/* 相同，见 security.md 的 Admin Access）

POST /api/admin/users/search（{ query }：email 或 user id，返回 { id }，找不到 404）

GET /api/admin/users/:id（用户、余额与账本合计、最近的流水、Task 和购买）

POST /api/admin/users/:id/credits（{ amount, id, reason }，返回 { balance, transactionId }；规则错误返回 { error: { code } }，code 为 AdminErrorCode）

GET /api/health（同 web 的 /api/health）

/api/auth/*（Better Auth）
```

`apps/api` 的已登录路由从 `userRoutes()`（`apps/api/src/routes/user-routes.ts`）开始，按顺序使用这些 middleware（`apps/api/src/middleware/`），不手写这些步骤：`webCors`（只允许 `APP_URL`，带 cookie）→ `webCsrf`（form 与 `text/plain` 请求不经过 CORS preflight，只接受 `APP_URL` 的 Origin，否则 `403 FORBIDDEN`）→ `database`（每请求一个连接）→ `session`（`c.var.user`，未登录 `401 UNAUTHORIZED`）→ 可选的 `rateLimit(name, key?)`（key 默认为 name，计数 key 为 `{key}:{userId}`；取消订阅用 `rateLimit("checkout", "subscription-cancel")`，同样的限额、单独计数）。JSON body 用 `readJson(c)`（`apps/api/src/http.ts`）读取，不是 JSON 时返回 `400 INVALID_INPUT`。错误由 `onError` 的 `errorHandler` 转为 Error Contract。

Better Auth 在 `apps/api` 的 `/api/auth/*`（见 security.md 的 Auth on the API）。web 的页面经 `NEXT_PUBLIC_API_URL` 调用 `GET /api/auth/get-session` 读取 session；浏览器代码用 `apiFetch()`（`apps/web/src/lib/api-fetch.ts`）调用 API，它带上 cookie。

web 只保留 `GET /api/health`（`apps/web/src/app/api/health/`，公开，不缓存，总是 200 `{ status: "ok" }`；数据库由 `apps/api` 的 `/api/health` 检查，见 observability.md 的 Uptime Monitoring）。ESLint 拒绝 web 中的其他 Route Handler，以及数据库、Service 和 Provider 适配器的导入（类型导入除外）。`/dashboard`、`/billing` 和导航栏在服务端用 `apiGet()`（`apps/web/src/server/api/api.ts`）带上请求的 cookie 调用 API，API 失败时抛错。`/admin` 的页面和 Server Action 同样调用 `/api/admin/*`。

不得因为“以后可能用”提前创建 API。

除 webhook 和 `/api/health` 外，所有路由都要求登录，未登录返回 `401 UNAUTHORIZED`。webhook 由 Provider 调用：不经过 `userRoutes()`，没有 CORS 和 session，只用 `database` middleware。

不使用 Cron API。需要定期处理的状态在读取时处理，例如 [Pending Expiry](billing.md#pending-expiry)。

---

## Error Contract

统一：

```json
{
  "error": {
    "code": "INSUFFICIENT_CREDITS",
    "message": "You don't have enough credits."
  }
}
```

Error Codes 与 HTTP Status：

| Code                   | HTTP |
| ---------------------- | ---- |
| UNAUTHORIZED           | 401  |
| FORBIDDEN              | 403  |
| INVALID_INPUT          | 400  |
| RATE_LIMITED           | 429  |
| INSUFFICIENT_CREDITS   | 402  |
| UPLOAD_NOT_FOUND       | 404  |
| TASK_NOT_FOUND         | 404  |
| PURCHASE_NOT_FOUND     | 404  |
| SUBSCRIPTION_EXISTS    | 409  |
| SUBSCRIPTION_NOT_FOUND | 404  |
| PROVIDER_ERROR         | 502  |
| PAYMENT_ERROR          | 502  |
| STORAGE_ERROR          | 502  |
| INTERNAL_ERROR         | 500  |

访问他人的资源返回对应的 `*_NOT_FOUND`（404），不返回 403，不泄露资源是否存在。`FORBIDDEN`、`TASK_NOT_FOUND`、`PURCHASE_NOT_FOUND`、`UPLOAD_NOT_FOUND`、`PROVIDER_ERROR`、`STORAGE_ERROR` 已在错误表中预留，当前没有路由返回：

- `UPLOAD_NOT_FOUND` 由 `verifyUpload()` 抛出，当前没有路由调用它。
- `PROVIDER_ERROR` 当前只作为失败 Task 的 `errorCode`。
- `STORAGE_ERROR` 当前只由浏览器上传客户端（`packages/storage/src/upload-client.ts`）使用。服务端访问 R2 失败返回 `INTERNAL_ERROR`。

`message` 只用于调试，前端按 `code` 显示本地化文案。

例外：`POST /api/webhooks/waffo` 的错误响应只有 `code`（`{ "error": { "code": "UNAUTHORIZED" } }`），没有 `message`。调用方是 Waffo，不是前端。

`INTERNAL_ERROR` 不得返回内部异常信息。

`AppError` 可以带 `details`，字段合并到 `error` 对象中。`RATE_LIMITED` 带 `Retry-After` header。

错误码在 `packages/observability/src/errors.ts`（HTTP 状态与英文调试信息，web 与 `apps/api` 共用）和 `apps/web/src/lib/api-error.ts`（客户端），两处由 `api-error.test.ts` 保持一致。

---
