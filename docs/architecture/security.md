# Security & Rate Limiting

## Security Requirements

必须：

```text
Authentication

Resource Ownership

Server-side Validation

Waffo Webhook Verification

Rate Limiting

Upload Validation

Environment Secret Isolation

Credit Concurrency Protection

Webhook Replay Protection
```

用户只能访问：

```text
task.user_id === currentUser.id

purchase.user_id === currentUser.id

subscription.user_id === currentUser.id
```

客户端不得看到：

```text
WAFFO_* secrets

R2_SECRET_ACCESS_KEY

BETTER_AUTH_SECRET

RESEND_API_KEY

GOOGLE_CLIENT_SECRET

SENTRY_AUTH_TOKEN

DATABASE_URL
```

只有 `NEXT_PUBLIC_*` 变量可以进入客户端 bundle。例外：`GOOGLE_CLIENT_ID` 是公开值（OAuth 跳转 URL 里也有），由服务端页面作为 prop 传给 Google One Tap，见 [Google One Tap](#google-one-tap)。

上传的对象 key 以 `uploads/{userId}/` 开头，使用前必须校验归属，见 [Upload Flow](storage.md#upload-flow)。

新增的 Provider 密钥（例如 AI 模型的 API Key）同样只在服务端读取，不加 `NEXT_PUBLIC_` 前缀。

Webhook Route 必须读取原始 request body 做签名验证，再解析 JSON。

---

## Session Checks

需要登录的页面分两步检查，按 Better Auth Next.js 集成文档的建议：

| 步骤       | 位置                                                | 做什么                                                                                                                                                                                    |
| ---------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 乐观重定向 | `apps/web/src/proxy.ts`（`/dashboard`、`/billing`） | 只用 `getSessionCookie()` 检查 session cookie 是否存在，不查数据库。没有 cookie → `/sign-in?next=<原路径>`。有 cookie → 放行，并把原路径写入请求头 `x-sign-in-next`（覆盖客户端发来的值） |
| 校验       | `(dashboard)/layout.tsx` 与各页面                   | `getRequestSession()` 查询并校验 session。无效（过期、已退出、伪造）→ `/sign-in?next=<x-sign-in-next，经 safeNext()>`                                                                     |

`getSessionCookie()` 不校验 cookie，所以 proxy 不是安全边界：每个需要登录的页面、`apps/api` 的路由（`session` middleware）和 Server Action 都自己校验 session。E2E：`dashboard.spec.ts` 用伪造的 cookie 检查重定向。

---

## Auth on the API

Better Auth 只在 `apps/api` 的 `/api/auth/*`（`apps/api/src/routes/auth.ts`，见 `docs/adr/012-api-modular-monolith.md`）。web 不连接认证表：浏览器经 `NEXT_PUBLIC_API_URL` 调用 API；服务端用 `createSessionClient()`（`packages/auth/src/session-client.ts`）带上请求的 cookie 调用 `GET /api/auth/get-session`，API 失败时抛错，不当作未登录。

- `baseURL` 是 API 自己的地址（`BETTER_AUTH_URL`）；`APP_URL`（web）加入 `trustedOrigins`，也是唯一允许的 CORS origin（`credentials: true`）。
- callback URL 可以是 web origin 上的绝对 URL（`isSafeCallback()`，路径部分仍经 `safeNext()` 校验）；其他 origin 返回 400。
- 设置 `AUTH_COOKIE_DOMAIN`（例如 `termrise.com`）时，session cookie 带 `Domain`，web 与 API 的子域名共用。本地不设置：`localhost` 的 cookie 不区分端口。
- Magic Link 的 IP 限流读 `cf-connecting-ip`；文案在 `apps/api/messages/*.json`，语言按 `NEXT_LOCALE` cookie → `Accept-Language` 选择（`packages/config/src/locale.ts`）。web 的登录表单把界面语言放在 `Accept-Language` 中发送，因为 web 的 `NEXT_LOCALE` cookie 不会发到 API 的子域名。
- 浏览器调用 API 需要 CSP 的 `connect-src` 包含 `NEXT_PUBLIC_API_URL` 的 origin（`apps/web/src/server/http/csp.ts`）。
- 子域名共用 cookie 后，同一站点的其他子域名发出的 form 或 `text/plain` 请求会带上 session cookie，且不经过 CORS preflight。`apps/api` 的业务路由因此用 `webCsrf`（Hono `csrf`）只接受 `APP_URL` 的 Origin，其他返回 `403 FORBIDDEN`。

---

## Google One Tap

未登录时，`/`、`/sign-in`、`/sign-up` 显示 Google One Tap 提示（`apps/web/src/components/auth/google-one-tap.tsx`），每次打开页面只提示一次，关闭后不重试。`/` 在访客第一次滚动、点击、触摸或按键后才加载 Google 脚本（约 100 KiB）和 Better Auth 的 One Tap 客户端（动态 `import()`），不与首屏争抢带宽（E2E：`landing.spec.ts`）；`/sign-in`、`/sign-up` 立即加载。已登录、脚本加载失败或用户关闭提示时，页面不变。

- 服务端用 Better Auth `oneTap()` 插件（`POST /api/auth/one-tap/callback`）校验 Google ID Token，audience 为 `GOOGLE_CLIENT_ID`。账号与 Google 登录共用：同一个 Google 账号只有一个用户，新用户同样获得注册赠送 Credits。
- `callbackURL` 与其他登录入口一样经 `safeNext` 校验，不合法返回 400。
- Google Cloud Console 的 OAuth client 必须把站点 origin 加入 Authorized JavaScript origins，见 [deployment.md](deployment.md)。

---

## Last Login Method

Better Auth `lastLoginMethod()` 插件在登录成功后写入 Cookie `better-auth.last_used_login_method`，值为 `google` 或 `magic-link`，保存 30 天。插件默认不识别 One Tap，`packages/auth/src/last-login-method.ts` 把 `/one-tap/callback` 记为 `google`。不写数据库。

- Cookie 不是 HttpOnly（插件固定如此），只保存登录方式名称，不含身份信息，不用于鉴权。
- `/sign-in`、`/sign-up` 在服务端读取该 Cookie。值为 `google` 时，Google 按钮右上角显示“Last used”标签。退出登录不清除该 Cookie。
- Privacy Policy 的 Cookie 说明包含该 Cookie。

---

## Admin Access

`/admin` 是内部管理台，只给 `ADMIN_USER_IDS` 中的用户使用（逗号分隔的 user id，只在服务端读取）。

- 未登录或不是管理员：所有 `/admin` 页面返回 404，不返回 401 / 403，也不跳转到登录页，不暴露入口是否存在。`/admin` 不出现在导航、sitemap 和 `robots.txt` 中，页面带 `noindex`。
- 每个页面和每个 Server Action（`apps/web/src/app/admin/actions.ts`）都单独检查 `getAdminSession()`，不只依赖 layout：Server Action 是可以直接 POST 的公开入口。未授权 action 不执行用户查找或 Credits 写入；用户查找返回 `{ notFound: true }`，调整 Credits 返回 `USER_NOT_FOUND` 状态。页面的 404 行为不等于 action 的 HTTP 响应。
- 用户查找用 POST 提交，email 不进 URL 和日志。
- 写操作只有调整 Credits：经 `CreditService.adminAdjust()`，每次最多 ±1000，原因必填。description 前加 `[by <管理员 user id>]`，同时写日志 `admin.credits_adjusted`。
- 幂等 id 在页面渲染时由服务端生成：重复提交同一表单不会重复调整；调整成功后页面重新渲染，生成新的 id。

管理员账号的邮箱被盗，等于管理台被盗。`ADMIN_USER_IDS` 只放必要的账号，这些账号的邮箱开启两步验证。

---

## Security Headers

`apps/web/next.config.ts` 对所有路径返回：

```text
X-Frame-Options: DENY
Content-Security-Policy: frame-ancestors 'none'; object-src 'none'; base-uri 'none'; form-action 'self'
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
```

不返回 `X-Powered-By`（`poweredByHeader: false`）。HSTS 由 Vercel 在自定义域名上自动添加。

### Content-Security-Policy

CSP 分两部分：

| 部分                                | 指令                                                                        | 位置                                                                  |
| ----------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 强制（`Content-Security-Policy`）   | `frame-ancestors`、`object-src`、`base-uri`、`form-action`                  | `apps/web/next.config.ts`，所有路径                                   |
| 只上报（`...-Report-Only`），不拦截 | `script-src 'nonce-…' 'strict-dynamic'`；`connect-src` 白名单；`report-uri` | `apps/web/src/proxy.ts` + `apps/web/src/server/http/csp.ts`，只对页面 |

- proxy 为每个页面请求生成新的 nonce，写入请求头 `x-nonce` 和 `content-security-policy-report-only`。Next.js 从请求的 CSP 头读取 nonce，加到自己的脚本上；它优先读 `content-security-policy`，所以 proxy 删除客户端发来的该请求头，强制部分只加在响应头上。
- 自己写的内联脚本必须带 nonce：根布局读取 `x-nonce`，传给 next-themes 的 `ThemeProvider`。JSON-LD（`type="application/ld+json"`）不执行，不需要 nonce。被带 nonce 的脚本加载的脚本（Google One Tap、Vercel Analytics）由 `'strict-dynamic'` 放行。
- `connect-src`：`'self'`（`/ingest`、`/monitoring`、`/_vercel`）、`https://accounts.google.com`（One Tap）、`https://*.r2.cloudflarestorage.com`（预签名上传），以及设置了 `R2_ENDPOINT` 时的本地存储 origin。新增浏览器直连的第三方服务时，加到 `csp.ts`。
- 开发环境（`next dev`）额外允许 `'unsafe-eval'`（React Refresh 需要）。
- 违规上报到 Sentry 的 security endpoint（由 `SENTRY_DSN` 生成：`https://{host}/api/{projectId}/security/?sentry_key={key}`）。DSN 不合法时不加 `report-uri`。
- API 路由、静态文件、`/ingest`、`/monitoring`、`/_vercel` 不经过 proxy，没有 Report-Only 头。

改为强制执行：Sentry 中没有来自正常页面的违规后，把 proxy 设置的头改为 `Content-Security-Policy`，并把两部分合并成一个头（proxy 同时设置强制部分，`next.config.ts` 中去掉 CSP）。

E2E：`security-headers.spec.ts` 检查两个头，并在 `/`、`/sign-in`、`/pricing`、`/blog`、`/dashboard`、`/billing` 上用 `securitypolicyviolation` 事件确认没有违规。

---

## Rate Limiting

产品 API 的限额（Task、Checkout、Upload）在 `packages/auth/src/api-rate-limits.ts` 的 `API_RATE_LIMITS` 中维护：`apps/api` 的路由用 `rateLimit(name, key?)` middleware 引用；Magic Link 的限额在 `packages/auth/src/rate-limit.ts` 的 `MAGIC_LINK_LIMITS` 中维护。计数服务 `createRateLimitService()` 在 `@repo/auth`。

Task（`task:{userId}`）：

```text
10 requests / minute / user
```

Checkout（`checkout:{userId}`）：

```text
10 requests / minute / user
```

取消订阅（`subscription-cancel:{userId}`）使用 Checkout 的限额，单独计数：

```text
10 requests / minute / user
```

Upload（`upload:{userId}`）：

```text
20 requests / minute / user
```

Magic Link 发送（`/api/auth/sign-in/magic-link`），发信前依次检查：

```text
3 emails / 10 minutes / email（key 为小写 email 的 SHA-256，不存原文）
10 emails / hour / IP（web：x-forwarded-for 第一项；apps/api：cf-connecting-ip；没有该 header 时跳过）
20 emails / day / IP（同上）
90 emails / day / 全站（低于 Resend Free 的 100 封 / 天；升级 Resend 后调高）
```

IP 的计数 key：IPv4 用原地址；IPv6 按 /64 前缀计数（一个用户通常拥有整个 /64，可以随意换地址）；IPv4-mapped 地址（`::ffff:a.b.c.d`）按其中的 IPv4 计数。

这些限额让全站上限更难被耗尽，但不能完全防止：攻击者控制足够多的 IP 时，仍可以用完当天的全站额度，此时用户只能用 Google 登录。完全防止需要人机验证（例如 Turnstile）或提高 Resend 的发信额度。

超限返回 429：除全站上限外，其他各项 `code` 为 `RATE_LIMITED`，全站上限为 `MAGIC_LINK_DAILY_LIMIT`，登录页提示改用 Google 登录。不使用 Better Auth 自带的限流作为防线：它的计数存在函数实例内存里，Serverless 环境下各实例独立且冷启动清零。实现在 `packages/auth/src/magic-link-limit.ts`，只接入生产环境的发信入口（`apps/web/src/server/auth/auth.ts`）。

实现：

```text
Postgres 固定窗口

INSERT INTO rate_limits (key, window_start, count)
VALUES (:key, :windowStart, 1)
ON CONFLICT (key, window_start)
DO UPDATE SET count = rate_limits.count + 1
RETURNING count
```

超限返回 `429 RATE_LIMITED`，带 `Retry-After` header。

过期窗口记录当前不清理（数据量可忽略）；流量变大后再加清理。

Webhook 不使用普通用户 rate limit。

Webhook 使用：

```text
Signature Verification
+
Idempotency
```

---
