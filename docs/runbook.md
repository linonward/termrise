# Runbook

线上问题的处理步骤。每一步只用这里列出的工具：管理台 `/admin`、Neon SQL Editor（只读查询）、`pnpm admin:adjust`、`pnpm admin:export-user`、`pnpm admin:delete-user`、`pnpm waffo:products`、Vercel 控制台、各服务商控制台。

下文的 `<project>` 是产品在 Neon 和 Vercel 中的项目名，`<domain>` 是产品的正式域名。

不要直接用 SQL 修改 `user.credit_balance`、`credit_transactions`、`tasks.status`。余额只经 CreditService 修改，任务状态只经 TaskService 修改，见 [CreditService](architecture/data-model.md#creditservice) 和 [tasks.md](architecture/tasks.md)。

---

## Production Access

| 需要              | 位置                                                                                                                              |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Production 连接串 | Neon 项目 `<project>` → `main` 分支 → Connect（pooled）                                                                           |
| 管理台            | `https://<domain>/admin`，用 `ADMIN_USER_IDS` 中的账号登录（见 [Admin Access](architecture/security.md#admin-access)）            |
| 只读查询          | Neon 控制台的 SQL Editor，选 `main` 分支                                                                                          |
| 日志              | Vercel 项目 `<project>` → Logs，按 `eventType` 搜索（日志格式见 [observability.md](architecture/observability.md#observability)） |
| 错误              | Sentry Production project                                                                                                         |
| 部署              | Vercel 项目 `<project>` → Deployments                                                                                             |

连接串只在本机终端的环境变量里使用，不写入文件，不贴到工单或聊天里。

找用户：在管理台 `/admin` 输入 email 或 user id，打开用户详情页。详情页显示余额、余额与流水是否一致、最近的 Credit 流水、Tasks 和 Purchases。工单和日志只记 user id。

管理台不可用时，在 SQL Editor 里用 email 查询：

```sql
select id, credit_balance, created_at from "user" where email = '<email>';
```

---

## Adjust Credits

用于补偿、纠错、Partial Purchase Reversal 的补扣。每次调整都写一条 `ADMIN_ADJUSTMENT` 流水。

### 用管理台调整

1. 在 `/admin` 找到用户，打开详情页。
2. 余额与流水不一致（页面显示红色提示）时，先不要调整，按 [Credit Invariants](architecture/data-model.md#credit-invariants) 排查原因。
3. 在 Adjust credits 中填写数量（扣减填负数，每次最多 ±1000）和原因（工单号，不含 email），提交。
4. 页面显示调整后的余额，流水中出现一条 `[by <你的 user id>] <原因>` 的人工调整。把调整后的余额记入工单。

同一个表单重复提交不会重复调整。提交后页面没有响应时，刷新页面，先看流水里有没有这次调整，再决定是否重新提交。

### 用脚本调整

管理台不可用，或需要超过 ±1000 的调整时使用。

1. 生成一个调整 id，并记在工单里：`uuidgen | tr A-Z a-z`。
2. 执行：

   ```bash
   DATABASE_URL='<Production 连接串>' pnpm admin:adjust \
     --user <userId> --amount=<±n> --id <调整 id> --reason "<原因，不含 email>"
   ```

   负数必须写成 `--amount=-5`（带 `=`）。

3. 脚本先输出目标数据库的 host，再输出 `transactionId` 和调整后的 `balance`。把两者记入工单。

规则：

- 同一个 `--id` 重复执行不会重复调整。命令中断或超时后，用同一个 id 重新执行。
- 同一个 id 换了用户或金额会报 `IDEMPOTENCY_CONFLICT`，说明这个 id 已经用过，换一个新 id。
- 扣减后余额会小于 0 时报 `INSUFFICIENT_CREDITS`，余额不变。

---

## Check Credit Ledger

核对每个用户的余额与流水是否一致（不变量见 [Credit Invariants](architecture/data-model.md#credit-invariants)）。

以下情况运行：

- 上线后每周一次。
- 调整 Credits 之前和之后。
- 出现 `billing.refund_shortfall` 日志之后。

在 Neon SQL Editor 里选 `main` 分支，运行下面两条只读查询。两条都返回空结果，说明余额与流水一致。

余额与流水合计不一致的用户：

```sql
select u.id, u.credit_balance,
       coalesce(sum(t.amount), 0) as ledger_sum,
       u.credit_balance - coalesce(sum(t.amount), 0) as diff
from "user" u
left join credit_transactions t on t.user_id = u.id
group by u.id, u.credit_balance
having u.credit_balance <> coalesce(sum(t.amount), 0)
order by abs(u.credit_balance - coalesce(sum(t.amount), 0)) desc;
```

最新一条流水的 `balance_after` 与余额不一致的用户：

```sql
select u.id, u.credit_balance, t.balance_after, t.id as transaction_id, t.created_at
from "user" u
join (
  select distinct on (user_id) user_id, id, balance_after, created_at
  from credit_transactions
  order by user_id, created_at desc, id desc
) t on t.user_id = u.id
where t.balance_after <> u.credit_balance;
```

发现不一致时：

1. 不要用 SQL 修改 `credit_balance` 或 `credit_transactions`。
2. 把 user id 和 `diff` 记入工单。不要记 email。
3. 在管理台打开这个用户，对照流水找出原因。
4. 确认原因后，按 [Adjust Credits](#adjust-credits) 调整。调整后再运行一次两条查询。

---

## Partial Purchase Reversal

信号：日志 `billing.refund_shortfall`（Sentry 同时告警），字段 `purchaseId`（Credit Pack）或 `subscriptionId`（订阅付款），以及 `shortfall`。

含义：退款时用户余额不够，按 [Purchase Refund](architecture/billing.md#purchase-refund) 或 [Subscription Refund](architecture/billing.md#subscription-refund) 只扣回了一部分，还差 `shortfall` 个 Credits。Purchase 已经是 `REFUNDED`；订阅状态不受退款影响。订阅的情况在第 1 步改查 `subscriptions` 表，reason 写 `refund shortfall <subscriptionId>`。

处理：

1. 查 Purchase 和用户当前余额（也可以在管理台打开该用户，看 Purchases 和余额）：

   ```sql
   select p.id, p.user_id, p.credits, p.status, u.credit_balance
   from purchases p join "user" u on u.id = p.user_id
   where p.id = '<purchaseId>';
   ```

2. 选一种处理方式，记入工单：
   - 用户现在余额足够：用 [Adjust Credits](#adjust-credits) 扣减 `shortfall`，reason 写 `refund shortfall <purchaseId>`。
   - 余额仍不够：扣减当前余额以内的部分，剩余部分记为损失。
   - 金额小：直接记为损失，不扣减。
3. 同一用户多次出现 shortfall（退款后已经用掉 Credits）：检查是否滥用退款，必要时在 Waffo 后台拒绝后续退款。

其他需要人工处理的支付日志：

| 日志                                                                                         | 含义                                                                             | 处理                                                                                                                                   |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `billing.payment_for_non_pending_purchase`                                                   | 已 REFUNDED 的 Purchase 收到付款成功事件，没有发 Credits                         | 在 Waffo 后台确认用户确实付款后，用 Adjust Credits 补发该包的 Credits，或在 Waffo 退款                                                 |
| `billing.late_payment`                                                                       | 已过期（FAILED）的 Purchase 收到付款成功事件，已自动改为 PAID 并发放 Credits     | 无需处理；同一用户频繁出现时，检查 Checkout 过期时间与 [Pending Expiry](architecture/billing.md#pending-expiry) 的 60 分钟是否仍匹配   |
| `billing.unknown_purchase`                                                                   | Webhook 中的 Purchase 在数据库里不存在                                           | 在 Waffo 后台按订单号核对；确认是我们的订单后按上一行处理                                                                              |
| `billing.unknown_subscription`                                                               | Webhook 中的订阅在数据库里不存在                                                 | 在 Waffo 后台按订单号核对                                                                                                              |
| `billing.replaced_subscription_paid`                                                         | 已被新 Checkout 取代或已过期的订阅收到付款或状态事件，已发放 Credits             | 在 Waffo 后台查看该用户是否有两个有效订阅；有则取消多余的一个并按需退款                                                                |
| `billing.cancel_failed`                                                                      | 用户在 Billing 页取消订阅，调用 Waffo 失败，订阅状态未变                         | 查看日志中的错误；用户可以重试。持续失败时在 Waffo 后台按订单号手动取消，之后的 webhook 会同步状态                                     |
| `webhook.payment_failed`（`Refund for a PENDING purchase` / `Refund for a FAILED purchase`） | 退款事件先于付款事件到达，返回 500 让 Waffo 重试；付款事件到达后的重试会正常扣回 | 等待重试。Waffo 停止重试后仍未扣回时：在 Waffo 后台确认付款与退款，Purchase 已变为 PAID 时用 Adjust Credits 扣回该次退款对应的 Credits |

---

## Subscription Cancel and Refund

规则见 [Cancel Subscription](architecture/billing.md#cancel-subscription) 与 [Subscription Refund](architecture/billing.md#subscription-refund)。用户可见的条款在 Terms 的 Credits and payments 和 Refund Policy 的 Subscriptions。

只取消（用户无法自己操作时）：

1. 在管理台找到用户，或在 Neon SQL Editor 查订阅（只读）：

   ```sql
   select id, status, provider_order_id, current_period_end
   from subscriptions
   where user_id = '<userId>' and provider_order_id is not null
   order by created_at desc;
   ```

2. 在 Waffo 后台按 `provider_order_id` 打开订阅并取消。ACTIVE 订阅在周期结束时结束，PAST_DUE 立即结束。
3. 等 `subscription.canceling` / `subscription.canceled` webhook 同步状态，Billing 页随之更新。不要手动改 `subscriptions` 表。

退款（Refund Policy：14 天内、该次付款的积分未使用）：

1. 在 Waffo 后台 Payments 中找到该次付款（`PAY_…`），发起全额或部分退款。
2. 退款成功后（约半小时内）`refund.succeeded` webhook 自动按比例扣回该次付款的积分，不需要用 Adjust Credits。出现 `billing.refund_shortfall` 时按 [Partial Purchase Reversal](#partial-purchase-reversal) 处理。
3. 退款不会取消订阅。用户要「退款并取消」时，同时按上面的步骤取消。

## Delete or Export an Account

用户通过支持邮箱要求删除账号或导出数据时使用。Terms 和 Privacy Policy 承诺 30 天内删除。

准备：

1. 确认请求来自账号自己的 email。不是同一个 email 时，回复用户从账号 email 重新发送。
2. 在 `/admin` 用 email 找到用户，记下 user id。
3. 两个脚本都需要 Production 的 `DATABASE_URL` 和 R2 变量（`R2_ACCOUNT_ID`、`R2_ACCESS_KEY_ID`、`R2_SECRET_ACCESS_KEY`、`R2_BUCKET`），从 Vercel 环境变量取得。脚本先输出目标数据库的 host，确认是 Production 再继续。

导出：

```bash
DATABASE_URL='<Production 连接串>' R2_ACCOUNT_ID=… R2_ACCESS_KEY_ID=… R2_SECRET_ACCESS_KEY=… R2_BUCKET=… \
  pnpm admin:export-user --user <userId> --out <userId>.json
```

- 文件包含账号信息、登录方式（只有名称，没有 token）、Credit 流水、购买、订阅、产品内容（示例中为 Task）和上传文件的 key 列表。上传文件本身不在文件中。
- 脚本不覆盖已有文件。把文件发给用户后，在本地删除。

删除：

1. 先预览，不加 `--yes`：

   ```bash
   DATABASE_URL='<Production 连接串>' R2_…=… pnpm admin:delete-user --user <userId>
   ```

   输出 `alreadyDeleted`、`activeSubscriptionId` 和要删除的上传文件。

2. `activeSubscriptionId` 不为 null 时，先按 [Subscription Cancel and Refund](#subscription-cancel-and-refund) 取消订阅。ACTIVE 订阅在当期结束时才变为 CANCELED，最长等一个计费周期。在工单中记下预计删除的日期。
3. 加 `--yes` 执行。脚本在一个事务中：
   - 把 `user` 改为 `Deleted user`、`deleted-<userId>@deleted.invalid`，删除头像；
   - 删除 session、OAuth 账号和 analytics 同意记录，用户立即退出登录；
   - 清空产品内容（示例中 Task 的输入与输出）。

   事务提交后，再删除 R2 中的 `uploads/<userId>/`。

4. 在 PostHog 中删除 distinct id 为该 user id 的 Person。
5. 在工单中记录删除日期，回复用户。

规则：

- 保留账本、购买、订阅和 `payment_events`：这些是法律要求保留的交易记录。余额不变，不变量仍然成立。
- 重复执行是安全的。上传文件删除失败时，重新执行同一命令。
- 用户之后用同一个 email 登录，会创建一个新账号，与旧账号没有关联。

## Rotate Secrets

通用步骤：

1. 在服务商控制台创建新的 key（旧 key 先保留）。
2. Vercel 项目 `<project>` → Settings → Environment Variables，更新对应环境的变量，类型选 Secret。
3. 重新部署：环境变量只对新部署生效。Deployments → 最新 Production 部署 → Redeploy。
4. 验证下表的检查项。
5. 在服务商控制台删除旧 key。

| 变量                                        | 在哪里创建新 key                                                       | 轮换后检查                                                      |
| ------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------- |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | Cloudflare → R2 → API Tokens，只授权对应 bucket 的 Object Read & Write | 在应用中上传一个文件                                            |
| `WAFFO_PRIVATE_KEY`                         | Waffo 后台 → API Keys（prod）                                          | 打开一次 Checkout 页面                                          |
| `RESEND_API_KEY`                            | Resend → API Keys                                                      | 用 email 登录一次                                               |
| `GOOGLE_CLIENT_SECRET`                      | Google Cloud Console → Credentials → OAuth client                      | 用 Google 登录一次                                              |
| `BETTER_AUTH_SECRET`                        | 本地生成：`openssl rand -base64 32`                                    | 登录一次。轮换前查 Better Auth 文档，确认对现有 session 的影响  |
| `SENTRY_AUTH_TOKEN`                         | Sentry → Settings → Auth Tokens                                        | 下一次部署的构建日志中 source maps 上传成功                     |
| `DATABASE_URL`                              | Neon 控制台重置 role 密码                                              | 确认 Neon 的 Vercel 集成已更新变量，再 Redeploy；打开 Dashboard |

Secret 泄漏时：先删除旧 key（接受短暂故障），再按上面的步骤创建新 key。

---

## Update Dependencies

以下情况执行：`Dependencies` workflow 失败（邮件或飞书通知）、PR 的 `Audit production dependencies` 失败，以及每月一次例行更新。检查的设置见 workflow.md 的 Dependency Checks。

修复漏洞：

1. 按 Slice 流程新建 worktree，运行 `pnpm audit --audit-level=high`，记下每条漏洞的包名、Paths 和修复版本。
2. 有漏洞的包是直接依赖时：`pnpm update --recursive <包名>@<修复版本>`。
3. 是间接依赖时，先升级 Paths 中的上层包：上层包已发布带修复的版本时，`pnpm update --recursive --latest <上层包>`。
4. 上层包没有修复版本时，在 `pnpm-workspace.yaml` 的 `overrides` 中只为这一条路径指定修复版本，例如 `"<上层包>>esbuild": ">=0.25.0"`。在 PR 中写明原因，上层包修复后删除这条 override。
5. 没有任何修复版本时：确认漏洞只在 dev 依赖中，或产品代码不会执行有漏洞的代码，再把 GHSA 编号加入 `pnpm-workspace.yaml` 的 `auditConfig.ignoreGhsas`，注释写日期、包名和原因。修复版本发布后删除这一条。不要用 `pnpm audit --ignore-unfixable`：它会把当前所有无修复的漏洞都写入这个列表，不经过判断。
6. 运行 `pnpm audit --audit-level=high`，结果不再列出这些漏洞。

例行更新（每月）：

1. `pnpm outdated --recursive` 列出过时的包。
2. patch 和 minor 更新放在一个 PR 中：`pnpm update --recursive`。
3. major 更新每个包一个 PR：`pnpm update --recursive --latest <包名>`，先读这个包的 changelog。
4. 第三方 SDK（`better-auth`、`@waffo/pancake-ts`、`@aws-sdk/*`、`next`、`drizzle-orm`）即使只是 minor 更新，也要读 changelog，不要猜测行为是否变化。

每次更新后：

- `pnpm lint`、`pnpm typecheck`、`pnpm test` 通过；本地构建后完整运行 `pnpm test:e2e`。
- `drizzle-orm` 或 `drizzle-kit` 更新后，运行 `pnpm db:generate`，确认没有生成新的 migration。
- 核对 `pnpm-lock.yaml` 的 diff 中没有意外的包。

## Change Prices

价格只在 `CREDIT_PACKS`（`packages/billing/src/credit-packs.ts`）和 `SUBSCRIPTION_PLANS`（`packages/billing/src/subscription-plans.ts`）里改，Waffo 商品价格必须一致。Webhook 发放的 Credits 取下单时记录的 `purchases.credits`，不核对实际付款金额，所以代码和 Waffo 价格不一致的时间要尽量短。

Waffo 规则（[Publish Product](https://docs.waffo.ai/api-reference/endpoints/onetime-products/publish-product)、[Update Product](https://docs.waffo.ai/api-reference/endpoints/onetime-products/update-product)、[Authentication](https://docs.waffo.ai/api-reference/authentication)）：

- 环境由 API Key 决定：test Key 改 test 商品，production Key 改 production 商品。
- 每个商品只能 publish 一次（test → production，ID 不变）。之后改价用 production Key 执行更新。
- 更新会生成新版本：新的结账用新价格，已创建的订单保留原价格。

步骤：

1. PR 合并前，用 test Key 执行 `pnpm waffo:products --apply`，再在 test 结账页核对价格。新商品的 ID 写入 `packages/billing/src/adapters/waffo.ts` 的 `WAFFO_PRODUCT_IDS`（订阅方案写入 `WAFFO_SUBSCRIPTION_PRODUCT_IDS`）。
2. 新商品用 test Key 执行 `pnpm waffo:products --publish <packId 或 planId>`（只能一次）。
3. 选择没有新订单的时间。查 `purchases` 中最近 45 分钟内的 `PENDING` 记录，有则等它们完成或过期。
4. 先改 production 价格：在 `apps/web/.env.local` 中临时换成 production Key（Waffo 后台 → API Keys），执行 `pnpm waffo:products` 核对计划，再执行 `--apply`；完成后删除本地的 production Key。也可以在 Waffo 后台手动改价。
5. 立即合并 PR，等 Production 部署完成。
6. 打开 `/pricing`，核对每个 Pack 和每个订阅方案的价格；对改过价的 Pack 或方案发起结账，核对 Waffo 结账页的金额（不付款）。

第 4 步到第 5 步之间，用户按新价格付款、按旧 Credits 到账（新定价每条更贵时，用户不吃亏）。如果新定价每条更便宜，就先部署代码，再改 Waffo。

---

## Apply a Production Migration

规则（只加不删、先 migrate 后部署）见 [Migrations](architecture/deployment.md#migrations)。Production 构建不执行 migration，需要手动执行。

1. PR 评审通过后、合并前，核对 PR 中新增的 `packages/db/migrations/*.sql`：只新增表、列或索引，不删除，不改名。
2. 在本机终端执行（连接串只放在环境变量里）：

   ```bash
   DATABASE_URL='<Production 连接串>' pnpm db:migrate
   ```

3. 在 Neon SQL Editor 中确认新表或新列已存在，并且 `drizzle.__drizzle_migrations` 中有这次 migration 的记录。
4. 合并 PR，等 Production 部署完成。

Migration 失败时不要合并 PR。修正 SQL 后重新执行；已经执行成功的 migration 不会再次执行。

---

## Roll Back a Deployment

代码：

1. Vercel 项目 `<project>` → Deployments，找到上一个正常的 Production 部署。
2. 选 Instant Rollback。按控制台提示处理之后的自动部署。
3. 修复代码，合并到 `main` 后重新发布。

数据库不回滚。Migration 只加不删，旧代码可以在新 schema 上运行，见 [Migrations](architecture/deployment.md#migrations)。

---

## Restore Data

只在大范围数据错误时使用：误删数据、错误的 migration、脚本写错了很多行。单个用户的余额错误用 [Adjust Credits](#adjust-credits)，不要恢复数据库。

能恢复多远取决于 Neon 的 history window，见 [Backups](architecture/deployment.md#backups)。Free 套餐只有 6 小时：发现问题后立即开始。

原地恢复会丢掉恢复时间点之后的全部写入：新注册的用户、扣费、购买和 Webhook 处理结果。所以先查看，再决定。

1. **确定时间点 T。** 在 Vercel Logs 和 Sentry 中找到出错的开始时间。T 选在开始时间之前。
2. **先在新分支上查看。** Neon 控制台 → Branches → New branch，父分支选 `main`，选 Past data，时间选 T，分支名 `restore-check-<日期>`。在 SQL Editor 中选这个分支，确认数据正确，并运行 [Check Credit Ledger](#check-credit-ledger) 的两条查询。这一步不影响 Production。
3. **只有少量数据需要找回时，不要原地恢复。** 从查看分支中读出正确的值，按正常流程修正：余额用 Adjust Credits，订阅和购买等 Waffo Webhook 或在 Waffo 后台处理。不要用 SQL 把行复制回 `main`。
4. **需要原地恢复时：**
   1. 在工单中记录 T 和当前时间。当前时间之后到恢复完成之间的写入都会丢失。
   2. Neon 控制台 → 选 `main` 分支 → Backup & Restore → Restore from history，时间选 T，确认后 Restore。
   3. 恢复完成后，连接串不变，应用自动重连。恢复前的数据保留在分支 `main_old_<时间>` 中。
5. **恢复后：**
   1. T 早于某次 migration 时，重新执行 migration：`DATABASE_URL='<Production 连接串>' pnpm db:migrate`。当前部署的代码依赖新的 schema。
   2. 运行 [Check Credit Ledger](#check-credit-ledger) 的两条查询，结果应为空。
   3. 在 Waffo 后台列出 T 之后的全部付款。每一笔都在 `purchases` 或 `subscriptions` 中查对应的行。缺少的付款对应的 Credits，按 Adjust Credits 补发，原因写付款号（`PAY_…`）。
   4. T 之后注册的用户需要重新注册。在 PostHog 中按注册事件找到这些用户的数量，记入工单。
   5. 确认无误后，删除 `restore-check-<日期>` 和 `main_old_<时间>` 分支：备份分支计入分支数和存储费用。Free 每个项目最多 10 个分支。

### Restore Drill

上线前，以及每次更换 Neon 套餐后，演练一次第 1–2 步：用 Past data 从 1 小时前创建分支，运行 Check Credit Ledger 的查询，然后删除这个分支。演练不修改 `main`。在工单中记录演练日期和当时的 History window。

---

## Site Down

uptime 监控告警时（设置见 [Uptime Monitoring](architecture/observability.md#uptime-monitoring)）：

1. 在浏览器打开 `https://<domain>/api/health`。
   - 返回 200：站点已恢复，或只是网络抖动。在 Vercel Logs 中查看告警时间附近的错误。
   - 返回 503：数据库不可用。在 Vercel Logs 中搜索 `health.database_unavailable`，再看 Neon 状态页，按下方 Provider Outages 处理。
   - 无响应或 5xx 页面：看 Vercel 状态页。
2. 告警前刚有一次 Production 部署时，按 [Roll Back a Deployment](#roll-back-a-deployment) 回滚。
3. 恢复后，在工单中记录开始时间、结束时间和原因。

## Provider Outages

先看服务商状态页，确认是对方故障。

| 故障          | 用户看到                             | 系统自动处理                                                    | 人工处理                                              |
| ------------- | ------------------------------------ | --------------------------------------------------------------- | ----------------------------------------------------- |
| 任务 Provider | 任务失败（`PROVIDER_ERROR`）         | 任务立即 FAILED 并退回 Credits；日志 `task.failed`              | 恢复后，在 Vercel Logs 确认 `task.failed` 不再出现    |
| R2            | 上传失败                             | 无                                                              | 无                                                    |
| Waffo         | 无法打开 Checkout（`PAYMENT_ERROR`） | Purchase 立即 FAILED，没有扣款；Webhook 处理失败时 Waffo 会重试 | 恢复后，在 Waffo 后台核对故障期间的付款都已发 Credits |
| Resend        | 收不到登录邮件                       | 无                                                              | 请用户改用 Google 登录                                |
| Neon          | 所有页面报错                         | 无                                                              | 等待恢复；不要在故障期间执行 migration                |

故障期间失败的任务都已自动退款，不需要补偿。需要额外补偿时用 [Adjust Credits](#adjust-credits)。

任务 Provider 是同步调用。函数在调用中途超时或崩溃时，任务会停在 `PENDING`。用户下次打开 `/dashboard` 或 `/billing`，或调用 `GET /api/tasks` 时，超过 15 分钟的 `PENDING` 任务自动改为 FAILED 并退款，日志 eventType 为 `task.stale`。不要用 SQL 修改任务状态。
