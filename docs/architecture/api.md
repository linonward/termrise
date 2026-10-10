# API Surface & Error Contract

## API Surface

只创建必要的 API。`apps/api` 的路由（`apps/api/src/routes/`）：

```text
GET /api/tasks（先把超时的 PENDING Task 改为 FAILED 并退款，再返回当前用户最近 20 条 Task，新的在前）

POST /api/tasks（{ requestId, input }，示例付费操作，成功返回 201 + Task，见 tasks.md）

POST /api/uploads（{ contentType, size, extension }，返回签名上传 URL，见 storage.md）

POST /api/analytics/consent（{ granted: boolean }，登录用户的 Cookie 横幅选择，成功返回 204，见 observability.md）

GET /api/health（同 web 的 /api/health）

/api/auth/*（Better Auth）
```

`apps/api` 的已登录路由从 `userRoutes()`（`apps/api/src/routes/user-routes.ts`）开始，按顺序使用这些 middleware（`apps/api/src/middleware/`），不手写这些步骤：`webCors`（只允许 `APP_URL`，带 cookie）→ `webCsrf`（form 与 `text/plain` 请求不经过 CORS preflight，只接受 `APP_URL` 的 Origin，否则 `403 FORBIDDEN`）→ `database`（每请求一个连接）→ `session`（`c.var.user`，未登录 `401 UNAUTHORIZED`）→ 可选的 `rateLimit("task")`（key 为 `task:{userId}`）。JSON body 用 `readJson(c)`（`apps/api/src/http.ts`）读取，不是 JSON 时返回 `400 INVALID_INPUT`。错误由 `onError` 的 `errorHandler` 转为 Error Contract。浏览器调用时用 `NEXT_PUBLIC_API_URL` 加路径，并设置 `credentials: "include"`。

web 的路由（`apps/web/src/app/api/`），按 ADR-012 的迁移顺序逐步迁到 `apps/api`：

```text
POST /api/checkout（{ packId } 或 { planId }，成功返回 201 { checkoutUrl }；已有已付款订阅时 { planId } 返回 409 SUBSCRIPTION_EXISTS，见 billing.md 的 Subscriptions）

GET /api/billing/purchases（先把超过 60 分钟的 PENDING 购买改为 FAILED，见 Pending Expiry，再返回当前用户的购买记录）

GET /api/billing/credit-activity?cursor=（Credit 明细，每页 20 条）

POST /api/billing/subscription/cancel（取消当前订阅，返回 200 { status, currentPeriodEnd }；没有可取消的订阅返回 404 SUBSCRIPTION_NOT_FOUND，见 billing.md 的 Cancel Subscription）

POST /api/webhooks/waffo

GET /api/health（公开，给 uptime 监控用；数据库可用时 200 { status: "ok" }，否则 503 { status: "error" }，不缓存，见 observability.md 的 Uptime Monitoring）
```

Better Auth 在 `apps/api` 的 `/api/auth/*`（见 security.md 的 Auth on the API），web 不再提供这个路径。web 的页面和路由经 `NEXT_PUBLIC_API_URL` 调用 `GET /api/auth/get-session` 读取 session。

不得因为“以后可能用”提前创建 API。

除 webhook 和 `/api/health` 外，所有路由都要求登录（`requireUser()`，经 `apps/api` 读取 session），未登录返回 `401 UNAUTHORIZED`。

web 中需要登录的路由用 `userRoute()`（`apps/web/src/server/http/user-route.ts`）包装，不手写下面的步骤：

```text
withRequestContext（日志带 requestId）
↓
requireUser() → 未登录 401
↓
rate limit（可选）：rateLimit: "task" 的 key 为 task:{userId}；{ limit, key } 用同一限额、不同 key
↓
handler({ request, user })
↓
任何错误 → errorResponse()（见 Error Contract）
```

```ts
export const POST = userRoute(
  { rateLimit: "upload" },
  async ({ request, user }) =>
    Response.json(
      await getUploadService().createUpload(user.id, await readJson(request)),
    ),
);
```

Route Handler 不导入 `@repo/db/*` 和 `drizzle-orm`（ESLint 检查）。读写数据只经 `@/server/*` 或 `@/features/*` 提供的 `getXService()`；可以从 `@repo/*` 导入不访问数据库的 DTO 函数，例如 `toCreditActivityDto`。

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
