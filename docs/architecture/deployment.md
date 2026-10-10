# Deployment

## Platform

```text
Vercel（GitHub 集成）
```

Vercel 项目的 Root Directory 是 `apps/web`。Vercel 识别 pnpm workspace，在仓库根目录安装依赖，再构建 `apps/web`；`apps/api` 不部署。`apps/worker` 部署在 Cloudflare，见 [Worker](#worker)。

| Git      | Vercel 环境                        |
| -------- | ---------------------------------- |
| `main`   | Production（自动部署）             |
| 其他分支 | 不自动部署；需要时手动部署 Preview |

Preview 按需手动部署，节省 Hobby 额度：

- `apps/web/vercel.json` 的 `git.deploymentEnabled` 只对 `main` 开启自动部署。不用 Ignored Build Step 来跳过：被它取消的构建仍然计入部署次数。
- 日常验证靠 CI（build + E2E）和本地 `pnpm build && pnpm start`。
- 需要公网 URL 时（OAuth 回调、Waffo webhook），二选一：在 worktree 中运行 `vercel deploy --target=preview` 手动部署一个 Preview（显式指定 target：新项目的第一次 CLI 部署曾被当作 Production）；或在本地开 Cloudflare Tunnel（`cloudflared`）把回调转发到 `pnpm dev`。

套餐：

- Hobby 条款不允许商业用途；开始收费前升级 Pro。以 Vercel 当前条款为准。
- Hobby 的函数执行时长上限较低。付费操作调用慢的 Provider（例如 AI 模型）时，先确认耗时在上限内，否则改为异步，见 [tasks.md](tasks.md)。
- Pro 的月费计入产品的固定成本。

---

## Worker

Termrise 的 `apps/worker` 运行在 Cloudflare Containers（需要 Workers Paid），Redis 用 Upstash（Fixed 套餐）。决策见 `docs/adr/011-worker.md`。

- Cloudflare Worker + Durable Object 启动容器；容器内运行 `apps/worker` 的 Node 进程。
- 容器可能随时被停止：平台先发 SIGTERM，最多等 15 分钟再 SIGKILL。Worker 收到 SIGTERM 后停止取任务，等待进行中的任务结束。
- 磁盘是临时的。任务状态只存在 PostgreSQL 和 Redis 中。
- Worker 与 web 连接同一个 Neon 数据库。

部署配置、保持容器运行的方式和发布步骤在实现 Worker 的 Slice 中按 Cloudflare 官方文档补充。

---

## Production Domain

新产品把 `example.com` 换成自己的域名。

| 域名                   | 作用                                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------- |
| `example.com`          | 主域名。Production 的 `APP_URL`、`BETTER_AUTH_URL` 都是 `https://example.com`                     |
| `www.example.com`      | 308 跳转到主域名（在 Vercel 的 Domains 中设置）                                                   |
| `{project}.vercel.app` | Vercel 默认域名，不对外使用。Better Auth 只信任 `BETTER_AUTH_URL` 的 origin，在这个域名上无法登录 |

外部服务中配置的地址都基于主域名，更换域名时逐项修改：

| 服务         | 配置                                                                                                                                     |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Google OAuth | Authorized redirect URI：`https://example.com/api/auth/callback/google`；Authorized JavaScript origins（One Tap）：`https://example.com` |
| Waffo        | Webhook URL：`https://example.com/api/webhooks/waffo`                                                                                    |
| R2           | `infra/r2/cors-prod.json` 的 origins                                                                                                     |
| Resend       | 发信域名的 SPF / DKIM 记录，与 `EMAIL_FROM` 一致                                                                                         |

---

## Region

所有有状态服务放在同一区域，避免扣费事务跨区往返：

| 服务             | 区域                                                   |
| ---------------- | ------------------------------------------------------ |
| Vercel Functions | `iad1`（美东）                                         |
| Neon             | AWS `us-east-1`                                        |
| R2               | location hint 选北美东部（以 Cloudflare 当前选项为准） |

Route Handler 一律使用 Node.js runtime，不使用 Edge runtime（数据库驱动需要 Node.js）。

---

## Environments

|          | Production        | Preview                                                                    | 本地开发           |
| -------- | ----------------- | -------------------------------------------------------------------------- | ------------------ |
| 部署来源 | `main`            | 从 worktree 手动部署（任意分支）                                           | worktree           |
| 数据库   | Neon `main`       | Neon `preview/{git-branch}`，由 Neon 的 Vercel 集成为每个 Preview 自动创建 | Neon `dev/{topic}` |
| 环境变量 | Vercel Production | Vercel Preview                                                             | `.env.local`       |

- 环境变量在 Vercel 控制台按环境分别配置，变量清单见 [environment.md](environment.md)。
- R2：每个环境使用自己的 bucket 和密钥（bucket 见 overview.md 的 Storage）。Vercel Production / Preview 各自配置四个 `R2_*` 变量，访问密钥使用 Secret 类型；本地开发默认用本地 SeaweedFS（`R2_ENDPOINT`，见 [Local Storage](storage.md#local-storage)）；使用 dev bucket 时，dev 密钥只放在 worktree 的 `.env.local`。
- 在 Neon 控制台用 Vercel 集成把 Neon 项目连接到 Vercel 项目。集成向 Vercel 注入 `DATABASE_URL` / `DATABASE_URL_UNPOOLED`：Production 指向 Neon `main`，Preview 部署时动态指向该 Preview 的分支，Vercel Development 环境指向集成自建的 `vercel-dev` 分支。这些变量不手动配置。
- 本地开发不使用 `vercel-dev`。不要用 `vercel env pull` 覆盖 `.env.local`：它会把 `DATABASE_URL` 换成 `vercel-dev`，而不是当前 worktree 的 `dev/{topic}`。
- Neon Free 每个项目最多 10 个分支：`main`、`vercel-dev`、每个进行中的 `dev/{topic}`、每个手动 Preview 的分支都计入。分支合并后立即删除 `dev/{topic}`；手动 Preview 用完后删除对应分支。

---

## Migrations

规则：**migration 只加不删**。新增列 / 表与删除列 / 表分两次发布；删除放到不再有代码引用之后的下一次发布。这样任何时候旧版本代码都能在新 schema 上运行，部署回滚不需要回滚数据库。

CI 运行 `pnpm db:generate`。生成了新的 migration 文件时 CI 失败：修改 `packages/db/src/schema` 的 PR 必须同时提交 migration。CI 不检查 migration 是否删除列 / 表，这条规则靠 Review 保证。

| 环境       | 执行方式                                                           |
| ---------- | ------------------------------------------------------------------ |
| Preview    | 手动部署 Preview 构建时自动执行，作用于该 Preview 自己的 Neon 分支 |
| Production | 手动执行，构建时不执行                                             |

`apps/web/vercel.json` 的 `buildCommand` 为 `pnpm vercel-build`（`apps/web/scripts/vercel-build.mjs`），根据 `VERCEL_ENV` 判断：`preview` 时先 `pnpm db:migrate` 再 build；`production` 时只 build，不连接数据库做 migration。

Production 发布顺序（PR 含 migration 时）：

```text
PR 审核通过
↓
对 Neon main 手动执行 migration：DATABASE_URL=<Production 连接串> pnpm db:migrate
↓
确认 migration 成功
↓
合并 PR → Vercel 部署 Production
```

由于 migration 只加不删，先 migrate、后部署代码是安全的。

---

## Rollback

```text
代码：Vercel 控制台回滚到上一个 Production 部署（Instant Rollback）
数据库：不回滚；依赖“只加不删”规则保证兼容
```

具体操作步骤在 runbook 的 Roll Back a Deployment。

---

## Backups

数据库恢复依赖 Neon 的 history window：在窗口内可以把分支恢复到任意时间点，或从过去的时间点创建新分支查看数据。窗口在 Neon 项目的 Settings → Postgres → History window 中设置，对项目的所有分支生效：

| Neon 套餐 | 默认   | 最长                        |
| --------- | ------ | --------------------------- |
| Free      | 6 小时 | 6 小时（历史数据上限 1 GB） |
| Launch    | 1 天   | 7 天                        |
| Scale     | 1 天   | 30 天                       |

- Free 只能恢复到 6 小时以内：周末或夜间发生的问题，发现时往往已经超出窗口。有付费用户之前升级到付费套餐，并把 History window 调到套餐的最长值。付费套餐按保留的历史数据量计费。
- 付费套餐在 Backup & restore 页面设置定时快照（Edit schedule → Daily），快照最多保留 35 天，用于超出 history window 的恢复。Free 只能保存 1 个手动快照。
- 原地恢复（Restore from history）只支持 root 分支，覆盖分支上的全部数据库；Neon 自动保留恢复前的状态，作为分支 `{branch}_old_{时间}`。连接串不变，恢复期间连接会中断。
- R2 中的文件不在数据库的时间线中，恢复数据库不会恢复或删除文件。

具体操作步骤在 runbook 的 Restore Data。
