# @repo/auth

Better Auth 配置（Magic Link、Google OAuth、One Tap）、权限守卫、安全跳转和限流。

| 子路径                         | 内容                                                                |
| ------------------------------ | ------------------------------------------------------------------- |
| `@repo/auth/create-auth`       | `createAuth(config)`：服务端 Better Auth 实例                       |
| `@repo/auth/client`            | 浏览器端 `authClient`                                               |
| `@repo/auth/guards`            | `createAuthGuards()`：`requireUser()` 要求登录                      |
| `@repo/auth/auth-redirect`     | `safeNext()`：只允许站内跳转                                        |
| `@repo/auth/rate-limit`        | `createRateLimitService()` 与 Magic Link 的限额 `MAGIC_LINK_LIMITS` |
| `@repo/auth/magic-link-limit`  | Magic Link 发信限流                                                 |
| `@repo/auth/last-login-method` | 记录上次登录方式的 Cookie                                           |

见 [security.md](../../docs/architecture/security.md)。

包的规则（子路径导入、不读取 env、不依赖 `apps/*`）见 [Monorepo](../../docs/architecture/overview.md#monorepo)。
