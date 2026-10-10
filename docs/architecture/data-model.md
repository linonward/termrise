# Data Model & Credits

## Database

核心业务表：

```text
user（Better Auth 管理，扩展 credit_balance）

tasks（示例付费操作，按产品替换）

credit_transactions

purchases

subscriptions

payment_events

rate_limits

analytics_consents
```

Better Auth 需要的内部表（user / session / account / verification）由 Better Auth CLI（`auth generate`）生成到 `packages/db/src/schema/auth.ts`，之后手工修改（`credit_balance` 的 NOT NULL 和 CHECK）。重新生成后要再次应用这些修改。

**ID 类型**：Better Auth 的 user id 类型以官方 Schema 为准（默认为 text）。
所有业务表的 `user_id` 必须与 Better Auth user id 类型一致，并建立外键。
业务表自身主键使用 UUID。

**SQL 类型**：字符串列在 schema 中为 TEXT，业务表的时间列为 TIMESTAMPTZ（`timestamp({ withTimezone: true })`）。下文 SQL 只表示字段含义，类型以 `packages/db/src/schema/` 为准。

---

## user

业务侧至少需要：

```text
id

email

name

image

credit_balance INTEGER NOT NULL DEFAULT 0 CHECK (credit_balance >= 0)

created_at

updated_at
```

`credit_balance` 通过 Better Auth 的 additional fields 扩展到 user 表，具体方式以官方文档为准。客户端不得写入该字段。

删除账号不删除 `user` 行：账本、购买和订阅引用它，这些记录要保留。`AccountService.deleteUser()`（`packages/admin/src/account-service.ts`）在一个事务中把 email 改为 `deleted-{id}@deleted.invalid`、name 改为 `Deleted user`、清空 image，删除 session、account、analytics_consents，并清空产品内容；之后删除 R2 中的 `uploads/{id}/`。有 ACTIVE、PAST_DUE 或 CANCELING 订阅时拒绝删除。操作步骤见 runbook 的 Delete or Export an Account。

注意：

`credit_balance` 是余额快照，用于性能和并发控制。

真正账目依据仍然是：

```text
credit_transactions
```

不变量：

```text
user.credit_balance == SUM(credit_transactions.amount WHERE user_id = user.id)
```

所有余额修改必须经过：

```text
CreditService
```

---

## Tasks

示例付费操作的记录表。新产品把它换成自己的业务表（例如生成任务），保留 `request_id` 幂等、`credits_cost` 快照和状态规则。流程在 tasks.md。

```sql
id UUID PRIMARY KEY

user_id TEXT NOT NULL REFERENCES user(id)

status TEXT NOT NULL            -- PENDING | SUCCEEDED | FAILED（CHECK）

request_id UUID NOT NULL        -- UNIQUE(user_id, request_id)

input TEXT NOT NULL             -- 去掉首尾空白后 1–500 字符（Service 校验）

output TEXT                     -- SUCCEEDED 时写入

credits_cost INTEGER NOT NULL   -- 创建时的价格快照，CHECK > 0

error_code TEXT                 -- FAILED 时写入：PROVIDER_ERROR 或 TIMEOUT

created_at TIMESTAMP NOT NULL

completed_at TIMESTAMP          -- 进入终态的时间
```

Indexes：

```text
user_id

created_at
```

- `(user_id, request_id)` 唯一约束让重试的请求返回同一条记录，不重复扣费。
- `credit_transactions.task_id` 引用 `tasks.id`。

---

## Task Status

```text
PENDING
   ├────────→ SUCCEEDED
   │
   └────────→ FAILED
```

- 终态：`SUCCEEDED`、`FAILED`。终态不再改变。
- 状态转换使用条件更新（`WHERE id = :id AND status = 'PENDING'`），更新 0 行即为已处理。
- 只有 TaskService 修改 Task 状态。

---

## Credit Ledger

禁止只依赖：

```text
user.credit_balance
```

必须建立：

```text
credit_transactions
```

Schema：

```sql
id UUID PRIMARY KEY

user_id TEXT NOT NULL REFERENCES user(id)

task_id UUID

purchase_id UUID

subscription_id UUID

type VARCHAR NOT NULL            -- CHECK type IN (Credit Transaction Types)

amount INTEGER NOT NULL          -- CHECK amount <> 0

balance_after INTEGER NOT NULL   -- CHECK balance_after >= 0

idempotency_key VARCHAR NOT NULL UNIQUE

description TEXT

created_at TIMESTAMP NOT NULL
```

Indexes：

```text
user_id

created_at
```

Ledger 只追加，不更新，不删除。

---

## Credit Transaction Types

只允许：

```text
SIGNUP_BONUS

PURCHASE

PURCHASE_REVERSAL

TASK_DEBIT

TASK_REFUND

ADMIN_ADJUSTMENT

SUBSCRIPTION_GRANT

SUBSCRIPTION_REVERSAL
```

规则：

```text
amount > 0
```

代表：

```text
credit increase
```

```text
amount < 0
```

代表：

```text
credit decrease
```

`amount = 0` 禁止写入（PURCHASE_REVERSAL 实际扣回为 0 时不写记录，只记录日志和 Sentry）。

Idempotency Key 汇总：

| Type                  | Idempotency Key                             |
| --------------------- | ------------------------------------------- |
| SIGNUP_BONUS          | `user:{userId}:signup-bonus`                |
| PURCHASE              | `purchase:{purchaseId}:credit`              |
| PURCHASE_REVERSAL     | `purchase:{purchaseId}:reversal`            |
| TASK_DEBIT            | `task:{taskId}:debit`                       |
| TASK_REFUND           | `task:{taskId}:refund`                      |
| ADMIN_ADJUSTMENT      | `admin:{uuid}`（调用方提供）                |
| SUBSCRIPTION_GRANT    | `subscription-payment:{paymentId}:credit`   |
| SUBSCRIPTION_REVERSAL | `subscription-payment:{paymentId}:reversal` |

---

## Credit Invariants

永远：

```text
balance >= 0
```

数据库层用 `CHECK (credit_balance >= 0)` 兜底。

付费操作的记录创建和扣费必须在同一个事务内（以 Task 为例）：

```text
BEGIN

INSERT task (status = PENDING, credits_cost = 服务端价格)

-- CreditService 锁定 user 余额，检查幂等 Ledger

UPDATE user
SET credit_balance = credit_balance - :cost
WHERE id = :userId AND credit_balance >= :cost
RETURNING credit_balance

-- 0 行 → ROLLBACK → INSUFFICIENT_CREDITS

INSERT credit_transaction (TASK_DEBIT, -cost, balance_after)

COMMIT
```

所有增加余额的操作同样在一个事务内完成：插入 Ledger + 更新快照。
写入前先用事务级 advisory lock 锁住 Idempotency Key。Key 已存在时返回已有记录，不重复写入；同一个 Key 的用户、类型或金额不同时抛出 `IDEMPOTENCY_CONFLICT`。

必须防止：

```text
Double Spend
```

例如：

```text
Balance = 10
```

两个并发请求：

```text
Request A = 10

Request B = 10
```

最终只能：

```text
A succeeds
B fails

or

B succeeds
A fails
```

最终：

```text
Balance = 0
```

禁止：

```text
Balance = -10
```

该场景必须有针对真实 PostgreSQL 的并发集成测试。

---

## Failed Task Refund

执行：

```text
TASK_DEBIT

-1
```

失败：

```text
TASK_REFUND

+1
```

Debit idempotency：

```text
task:{taskId}:debit
```

Refund idempotency：

```text
task:{taskId}:refund
```

重复调用不得重复退款。退款金额取自扣费 Ledger，不重新读取价格。

退款触发条件：Provider 抛出错误（`PROVIDER_ERROR`），或 Task 超过 15 分钟仍为 PENDING（`TIMEOUT`，读取时清理，不用 Cron）。Task 改为 FAILED 与退款在同一事务内执行，只有从 PENDING 更新成功时才退款。

---

## CreditService

位置：

```text
packages/credits/src/credit-service.ts
```

提供：

```text
getBalance()

listActivity()

findEntry(idempotencyKey)

grant(entry)

reverse(entry)

grantSignupBonus()

debit(entry)

refund(entry)

adminAdjust()
```

CreditService 只负责余额与 Ledger，不读取也不修改 Task、Purchase、Subscription 的状态（`listActivity()` 只为展示 join 它们的 `pack_id` / `plan_id`）。订单规则在 BillingService 中，决策见 ADR-010（`docs/adr/010-ledger-primitives.md`）。

- `grant(entry)`：每个幂等键只增加一次 `amount`（必须为正整数）。
- `reverse(entry)`：每个幂等键只扣回一次，最多 `credits`，以余额为上限；返回 `{ transaction, shortfall }`，`shortfall` 是余额不足的部分。实际扣回为 0 时不写 Ledger（`amount <> 0`），`transaction` 为 `null`。扣回写入 Ledger 后，重复调用返回第一次的结果；扣回为 0 时没有记录，同一幂等键再次调用会重新计算，余额已增加时会再扣。调用方要自己保存「已扣回」的标记：Purchase 用 REFUNDED 状态。订阅付款退款目前依靠 webhook inbox 按事件 id 去重：同一笔付款的退款以不同事件 id 再次投递，且第一次扣回为 0 时，会再次扣回。Waffo 重试时事件 id 不变，所以当前不会发生；新增事件重放入口或复用 `reverse()` 前，先补上这个标记。
- `findEntry(idempotencyKey)`：按幂等键读取一条 Ledger。

`adminAdjust()` 有两个调用入口：管理台的用户详情页（`/admin/users/[id]`，见 [Admin Access](security.md#admin-access)），和脚本 `apps/api/scripts/admin-adjust.ts`（`pnpm admin:adjust`）。操作步骤在 runbook 的 Adjust Credits。

调用入口为 `createCreditService(database)`。需要与业务状态共同提交时传入已有的 Drizzle transaction：`createCreditService(tx)`；内部使用 savepoint，调用方回滚时余额与 Ledger 同时回滚。

- `debit(entry)`：每个幂等键只扣一次 `amount`（正整数），余额不足时报 `INSUFFICIENT_CREDITS`。`refund(entry)`：按 `debitKey` 找到同一用户的扣费，每个幂等键只退回一次全额；扣费不存在时报 `INVALID_CREDIT_OPERATION`。
- TaskService 在创建 PENDING Task 的同一事务内调用 `debit()`，金额取自 `credits_cost` 快照；在把 PENDING 改为 FAILED 的同一事务内调用 `refund()`。Task 的状态规则只在 TaskService 中，CreditService 不读取 `tasks`。
- BillingService 在 webhook 事务内锁定 Purchase / Subscription，再调用 `grant()` / `reverse()`。Purchase 退款时，BillingService 在同一事务内写 PAID → REFUNDED 并调用 `reverse()`；REFUNDED 同时是「已扣回」的标记，实际扣回为 0 时也不会再扣。`shortfall > 0` 由 BillingService 记录日志与 Sentry 告警。
- 锁顺序为业务记录（Purchase / Subscription，由 BillingService 加锁）→ user 余额 → Ledger 幂等键。余额行使用 `FOR NO KEY UPDATE`，与新建 Task 的外键检查兼容。普通调用只处理一个用户和一条业务记录；跨用户批量脚本逐条执行。
- 注册时，Better Auth `databaseHooks.user.create.after` 调用应用传入的 `onUserCreated`（`apps/web/src/server/auth/on-user-created.ts`），由它调用 `grantSignupBonus(userId, amount)`；数量取自 `product.config.ts` 的 `signupBonusCredits`（Starter 为 10，0 表示不赠送）。覆盖两种登录方式的首次建用户流程。旧用户不会在读取 Dashboard 时补发 Credits。`@repo/auth` 不依赖 `@repo/credits` 和 `@repo/analytics`。

其他模块不得直接：

```text
UPDATE user SET credit_balance...
```

---

## Purchases

```sql
id UUID PRIMARY KEY

user_id TEXT NOT NULL REFERENCES user(id)

provider VARCHAR NOT NULL

provider_session_id VARCHAR

provider_order_id VARCHAR

provider_payment_id VARCHAR

pack_id VARCHAR NOT NULL

amount_usd INTEGER NOT NULL   -- 单位：美分

credits INTEGER NOT NULL

status VARCHAR NOT NULL

created_at TIMESTAMP NOT NULL

completed_at TIMESTAMP

refunded_at TIMESTAMP
```

Unique：

```text
(provider, provider_order_id)
```

Status：

```text
PENDING

PAID

FAILED

REFUNDED
```

允许的转换：

```text
PENDING → PAID | FAILED

FAILED  → PAID（过期后到达的付款）

PAID    → REFUNDED
```

FAILED：Checkout 创建失败，或超过 60 分钟未付款，见 [Pending Expiry](billing.md#pending-expiry)。

先以内部 purchase id 创建 PENDING 记录，`createCheckout()` 返回后写入 `provider_session_id`；`provider_order_id`、`provider_payment_id` 由 webhook 回填（Waffo 在创建 Checkout 时不返回 Order ID）。

---

## Subscriptions

```sql
id UUID PRIMARY KEY

user_id TEXT NOT NULL REFERENCES user(id)

provider VARCHAR NOT NULL

provider_session_id VARCHAR

provider_order_id VARCHAR      -- 首次付款或激活的 webhook 回填；非空即已付款

plan_id VARCHAR NOT NULL

amount_usd INTEGER NOT NULL    -- 每期价格，美分

credits INTEGER NOT NULL       -- 每期 Credits，创建时快照

status VARCHAR NOT NULL        -- PENDING | ACTIVE | CANCELING | PAST_DUE | CANCELED | FAILED

status_updated_at TIMESTAMP    -- 最后一次生效的状态事件的 Waffo 时间

current_period_end TIMESTAMP   -- 当前周期结束时间，来自状态事件

created_at TIMESTAMP NOT NULL
```

Unique：`(provider, provider_order_id)`。`credit_transactions.subscription_id` 引用本表。规则见 [Subscriptions](billing.md#subscriptions)。

---

## Payment Events

建立 Webhook Inbox：

```sql
id UUID PRIMARY KEY

provider VARCHAR NOT NULL

provider_event_id VARCHAR NOT NULL

event_type VARCHAR NOT NULL

payload JSONB

processed_at TIMESTAMP

created_at TIMESTAMP NOT NULL
```

Unique：

```text
(provider, provider_event_id)
```

作用：

```text
Webhook
↓
Verify
↓
Store Event
↓
Deduplicate
↓
Process
↓
processed_at = now()
```

已存在且 `processed_at` 不为空：直接返回 200。
已存在但 `processed_at` 为空（上次处理失败）：重新处理。

---

## rate_limits

```sql
key VARCHAR NOT NULL          -- 例如 task:{userId}

window_start TIMESTAMP NOT NULL

count INTEGER NOT NULL

PRIMARY KEY (key, window_start)
```

限流规则见 [security.md · Rate Limiting](security.md#rate-limiting)。

---

## analytics_consents

```sql
user_id TEXT PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE   -- 每个用户一行

granted BOOLEAN NOT NULL       -- Cookie 横幅的选择：true 同意 / false 拒绝

updated_at TIMESTAMP NOT NULL
```

没有记录 = 尚未选择，与拒绝相同：不发送服务端事件。

---
