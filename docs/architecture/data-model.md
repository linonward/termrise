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

research_projects（Termrise 的研究项目）

source_signals（热词的观测来源）

radar_items、radar_observations（Radar：公开来源的故事与每次观测）

worker_heartbeats（每个 Worker 进程运行的服务配置）

provider_cache（付费服务的回答，在有效期内复用）

radar_favorites（用户收藏的 Radar 条目）

research_runs、keywords、keyword_metric_snapshots、serp_snapshots、serp_results（研究运行的结果）
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

## Research Projects

`research_projects`（`packages/db/src/schema/research.ts`）：一个研究项目是一个市场中的一组种子词，加上付费数据和 AI 调用的预算。

| 列                                       | 说明                                                                                                                                                                |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `user_id`                                | 所有者，外键 `user.id`。只有所有者能读写；其他用户和格式错误的 id 一律返回 `RESEARCH_PROJECT_NOT_FOUND`                                                             |
| `name`                                   | 1–100 字符（CHECK）                                                                                                                                                 |
| `location_code`、`language_code`         | DataForSEO 的地区和语言代码。现在固定为 2840 / `en`（美国、英语，`packages/research/src/research-rules.ts`）                                                        |
| `seeds`                                  | `text[]`，1–50 个（CHECK）。存入前规范化：NFKC、去首尾空白、合并空白、小写、去重，保留顺序（`normalizeSeeds()`）；每个最多 80 字符                                  |
| `data_budget_micros`、`ai_budget_micros` | 预算，整数微美元（1 USD = 1,000,000），≥ 0（CHECK）。API 以美元表示，精确到分，每项最多 1000 美元；默认 20 / 5 美元                                                 |
| `status`                                 | product.md 的研究状态（`draft` 到 `completed`，异常 `partial` / `failed` / `cancelled` / `budget_exhausted`），默认 `draft`；`draft` 和 `budget_exhausted` 可以修改 |

- 只有 ResearchService（`packages/research/src/research-service.ts`）修改研究项目。只有 `draft` 可以修改和删除；修改和删除的条件包含 `status = 'draft'`，项目在此期间开始运行时返回 `RESEARCH_PROJECT_LOCKED`（409）。
- 状态迁移（运行、暂停、重试）在后续 Slice 中由 ResearchService 和 Worker 实现。
- 删除账号时，`apps/api/src/product-data.ts` 删除用户的研究项目（没有其他表引用它们）；导出账号时包含它们（`packages/research/src/user-data.ts`）。

---

## Source Signals

`source_signals`（`packages/db/src/schema/signals.ts`）：某个词在某个来源被观测到一次（product.md 的 F01）。现在只有 CSV 导入（`provider = 'csv'`），属于一个研究项目。Hacker News 的全局数据在 [Radar](#radar) 中。

| 列                        | 说明                                                                                                                                          |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `project_id`              | 外键 `research_projects.id`，`ON DELETE CASCADE`：删除项目时删除它的信号                                                                      |
| `provider`、`external_id` | 来源与来源 id；CSV 的 `external_id` 是「规范化的词 + url + 观测时间」的 SHA-256。`(project_id, provider, external_id)` 唯一，重复导入不新增行 |
| `raw_title`               | 原文（最多 500 字符）                                                                                                                         |
| `normalized_term`         | 与种子词相同的规范化（`normalizeSeeds()`）                                                                                                    |
| `observed_at`             | 来源观测到的时间；来源没有给出时为 null，不用导入时间代替                                                                                     |
| `ingested_at`             | 导入时间                                                                                                                                      |
| `metadata`                | CSV 的 `source`、`note`（各最多 500 字符）                                                                                                    |

- 导入（`ResearchService.importCsv()`）在一个事务中锁住项目行，只允许 draft；新词按出现顺序追加到种子词，最多 50 个，其余只保留为信号。并发导入同一个项目时种子词不会丢失（集成测试覆盖）。
- 账号导出包含每个项目的信号；删除账号时随项目一起删除。

---

## Radar

`radar_items` / `radar_observations`（`packages/db/src/schema/radar.ts`，`packages/research/src/radar.ts`）：Worker 从公开来源采集的故事（product.md 的 F01）。全局数据，不属于某个用户：所有登录用户看到同样的条目，删除或导出账号时不包含。

- Hacker News：官方 API（`https://hacker-news.firebaseio.com/v0`，不需要 Key，`packages/research/src/adapters/hacker-news.ts`）。它没有搜索，只有故事列表和逐条读取。每次采集读 `topstories` 和 `showstories` 各前 60 个，并发 5 个请求；只保存 `type = story`、不是 dead / deleted、有标题的条目。
- `radar_items`：一个故事一行，`(provider, external_id)` 唯一（HN 的 item id）。记录标题（最多 500 字符）、规范化的词（去掉 `Show HN:` 等前缀，规则同种子词）、链接（只保留 http / https，否则为 null）、发布时间、`first_seen_at` / `last_seen_at`（本系统第一次和最近一次看到它，不是它在互联网上出现的时间）、最新的分数和评论数（来源没有报告时为 null）。再次采集时更新标题、链接、分数和评论数，`first_seen_at` 不变。
- `radar_observations`：只追加。每次采集，故事在每个列表中出现一次就记一行：时间、列表（`top` / `show`）、排名（从 1 开始）、分数、评论数。
- Google Trends（`adapters/google-trends.ts`）：Trending Now 的 RSS（`https://trends.google.com/trending/rss?geo=US`），Trends 帮助页列出的导出方式之一，公开、不需要 Key，robots.txt 不禁止。RSS 没有公开的字段说明：解析用 2026-10-10 保存的真实订阅（`testing/google-trends-feed.xml`）测试，字段变化时解析失败、任务失败，不猜。每次采集读美国市场的条目（约 10 个）。每个搜索、市场、日期一个条目（`external_id` 为 `<geo>:<日期>:<规范化的词>`）：同一天再次出现时增加观测，另一天再次出现是新条目，所以生命周期能判断重复出现。`score` 是 Google 的近似搜索次数下限（`500+` 存为 500），不是月搜索量；`comments` 为 null；链接是 Google 关联的第一条新闻；观测的列表为 `trending`。
- 某个故事读取失败时跳过它；全部失败时任务失败，由队列重试。读取列表失败时任务失败。
- 生命周期（`radar-lifecycle.ts`，版本 `lifecycle-v1`，product.md 的 F02）：读取时按观测计算，不存储，只用讨论热度。依次判断：同一个词在往年同月的更早条目中出现过（相隔至少 7 天）为 `seasonal`；在至少 7 天前的更早条目中出现过为 `recurring`；有分数的观测少于 3 次或跨度不到 3 小时为 `insufficient_data`；只有 Hacker News 计算增长（Google Trends 的分数是近似范围，不是会增长的点数，只判断重复与季节）：最近 6 小时（以最后一次观测为终点）增加至少 100 分为 `breakout`，至少 20 分为 `emerging`；出现至少 24 小时为 `sustained`；其余为 `insufficient_data`。没有分数的观测不参与比较。
- 分数和评论数是讨论热度，不是搜索量，页面会说明。研究项目可以从一个条目开始：种子词为规范化的词，按词边界截到 80 字符。

---

## Worker Heartbeats

`worker_heartbeats`（`packages/db/src/schema/workers.ts`，`packages/research/src/provider-status.ts`）：每个 Worker 进程一行（`worker_id`，默认主机名，可用 `WORKER_ID` 设置），启动时和之后每分钟写入关键词数据来源、分析来源与模型、Radar 采集的来源（`radar_sources`，为空表示不采集）、启动时间和最近在线时间。不含 Key。API 不读取 Worker 的环境变量，`/settings/providers` 从这张表和账本读取服务状态：

- Worker 3 分钟内写过为在线，否则为离线；没有行时为未启动。
- 连接状态是该服务最近一次真实调用的结果（`api_usage` 的最近一行），不为检查连接额外调用服务。
- 花费按服务和预算类型汇总当前用户的项目：调用数、失败数、已花费（settled 的费用）、预留（reserved 与 failed 的预留额）。

---

## Research Runs and Keywords

研究的运行（`packages/research/src/research-runner.ts`）：API 只写一条 `pending` 的运行并锁住项目（`queue`），`apps/worker` 执行它（`execute`，见 jobs.md）。

- 取消：`pending` 或 `running` 的运行可以取消（`cancelled`），项目改为 `cancelled`，之后可以再运行。Runner 在每次付费调用前和每个阶段之间检查运行是否仍为 `running`，不是就停止；已发出的调用照常结算。
- `claimed_at`：Worker 领取运行的时间，排队时为 null。领取超过 30 分钟仍在运行的，由下一次扫描改为 `failed`（`RUN_TIMED_OUT`），见 jobs.md 的 Termrise。
- `research_runs`：一次运行。`(project_id, request_id)` 唯一：重试同一个请求只开始一次运行，返回同一条记录。`status` 为 `pending`（排队中，`stage` 为 `queued`）/ `running` / `completed` / `partial` / `failed`，`stage` 是当前或最后到达的阶段，`error_code` 在失败时有值（`PROVIDER_ERROR`、`INTERNAL_ERROR`、`BUDGET_EXHAUSTED`）；预算不足使运行提前结束的 `partial` 也记录 `BUDGET_EXHAUSTED`。
- 开始运行时在一个事务中锁住项目行：只有 `draft`、`failed` 或 `budget_exhausted` 的项目能开始（失败后可以重试）。两个请求同时开始时，第二个返回 `RESEARCH_PROJECT_LOCKED`。项目状态依次为 `expanding`（排队时就进入，锁住项目）→ `auditing` → `evaluating` → `completed` / `partial`；扩词失败为 `failed`。运行与项目的状态在同一个事务中修改。
- `keywords`：项目的关键词，`(project_id, phrase)` 唯一。`source` 为 `seed` 或 `expansion`，`seed` 记录它来自哪个种子词。每次运行最多 200 个（种子词全部保留，其余按扩词顺序）。失败后重试时沿用已有的关键词行。
- `keyword_metric_snapshots`：Provider 报告的指标，只追加。`search_volume`（月均搜索量）、`cpc_micros`（微美元）、`ads_competition`（Google Ads 竞争度 0–100）、`keyword_difficulty`（SEO 难度 0–100）各自独立，Provider 没有报告时为 null，不写 0（product.md 的 F03）。页面显示最新的一条。
- `serp_snapshots` / `serp_results`：搜索量最高的 5 个关键词（搜索量为 null 或 0 的不审核）在桌面端的前 10 个自然结果，记录 Provider、设备、地区、语言和时间。某个关键词的 SERP 失败时跳过它，运行结束为 `partial`。
- 每条指标和 SERP 都记录 `provider`。现在只有 `fake`（`packages/research/src/adapters/fake-keywords.ts`）：按词生成确定性的测试数据，SERP 链接到 `.invalid` 域名；只在 `ALLOW_FAKE_PROVIDERS=1` 时可用，页面在数据来自 `fake` 时显示「测试数据，不是真实的搜索数据」。真实 Provider 是 DataForSEO（见下一条），实现同一个端口（`keyword-provider.ts`）。
- DataForSEO（`adapters/dataforseo.ts`，v3，HTTP Basic auth，每次 Live 调用一个任务，顶层与任务的 `status_code` 都是 20000 才算成功）：扩词用 Google Ads `keywords_for_keywords/live`（每个种子词一次；搜索量、CPC、`competition_index` 作为广告竞争度 0–100，不当作 KD；同一进程中两次调用至少间隔 5 秒，官方限制为每分钟 12 次）；扩词后，对没有 KD 的关键词调用一次 Labs `bulk_keyword_difficulty/live`（最多 200 个），没有数据的仍为 null；KD 调用失败或预算不足时继续运行，KD 为 null，运行为 `partial`；SERP 用 `serp/google/organic/live/advanced`（桌面端，`depth` 10，只保留 `organic` 结果，按 `rank_group` 取前 10）。错误只包含路径和状态码，不包含账号和响应内容。
- 删除项目时，运行、关键词、指标和 SERP 随之删除（`ON DELETE CASCADE`）。

---

## Budget Ledger

每个付费调用都经过 `api_usage`（`packages/research/src/budget.ts`，product.md 的「外部服务与预算」）。

- 调用前预留：在一个事务中锁住项目行，计算该预算（`data` 或 `ai`）已占用的金额：已结算的按实际费用，`reserved` 和 `failed` 按预留额。加上本次调用的上限（端口的 `maxCostMicros`）超过项目预算时，不调用，返回预算不足。并发预留排队进行，不会超出预算。
- 调用后结算：成功时记录 Provider 报告的费用（`cost_micros`），状态为 `settled`。调用失败时状态为 `failed`，费用未知，预留额继续计入，不当作 0。
- 记录项目、运行、预算类型、Provider、操作（`expand`、`serp`、`analyze`）、预留额、费用、状态和时间。删除项目时随之删除。
- 运行中的预算不足：一个种子词都扩不了时，运行 `failed`（`BUDGET_EXHAUSTED`），项目状态为 `budget_exhausted`，可以修改预算后再运行；扩词、SERP 中途不足时停止该阶段；AI 预算不足时该机会不做分析（`analysis_error` 为 `BUDGET_EXHAUSTED`），分数照常。有阶段因预算提前结束时运行为 `partial`。
- fake Provider 的费用是编造的固定值（扩词上限 0.10 / 实际 0.075 美元，SERP 0.02 / 0.006，分析 0.01 / 0.0015），只用于测试账本，不是服务商价格。真实 Provider 按官方文档的 `cost` 结算。
- DataForSEO 每个响应都报告费用（美元），按任务的 `cost` 结算。预留额高于官方价格页（2026-10-10 核对）：扩词 0.10 美元（Google Ads Live 每任务 0.09）、SERP 0.01（每 10 个结果 0.002，带 `site:` 等运算符时 5 倍）、KD 0.05（Labs 每任务 0.012 + 每个关键词 0.00012）。操作名为 `expand`、`difficulty`、`serp`。
- DeepSeek 不返回费用：按返回的 token（缓存命中、未命中、输出）乘以 `adapters/deepseek-prices.ts` 中的价格计算，向上取整。官方价格页（2026-10-10 核对）分高峰和低谷价格，高峰时段排除中国法定节假日，代码无法可靠判断，所以一律按高峰价结算：账本可能高于实际账单，不会低于。价格表中没有的模型不能使用。每次分析的预留额 = 7000 个输入 token 按未命中价 + 1500 个输出 token（`deepseek-flash` 为 0.0039 美元）。

---

## Favorites

收藏（`packages/research/src/favorites.ts`）：

- 机会：`opportunities.starred_at`，只有项目的所有者可以收藏，取消时为 null。重复收藏保留第一次的时间。
- Radar 条目是全局的，收藏属于用户：`radar_favorites`（`user_id`、`item_id` 为主键，删除条目时随之删除）。
- 重复收藏或重复取消不改变结果。列表用 `starred=1` 只列收藏。
- 账号导出包含 Radar 收藏（标题、链接、来源、时间）和机会的 `starredAt`；删除账号时用户行被匿名化而保留，所以 Radar 收藏在 `eraseRadarFavorites()` 中删除，不依赖外键。

---

## Provider Cache

`provider_cache`（`packages/db/src/schema/cache.ts`，`packages/research/src/provider-cache.ts`）：付费服务的回答，在有效期内复用，不再付费（termrise.md 的「避免重复计费」）。只缓存市场数据，所有用户共用，不含用户数据。

- 键是 SHA-256（缓存版本、服务、操作、地区、语言、参数）。值是适配器映射后的结果，记录服务回答的时间 `fetched_at` 和到期时间 `expires_at`。再次付费时覆盖同一行。
- 只有声明了 `cacheTtlMs` 的服务使用缓存（fake 不使用）。DataForSEO：扩词与 KD 30 天（Google Ads 的搜索量是月度数据，KD 变化慢），SERP 7 天。
- 扩词按种子词缓存，SERP 按关键词缓存，KD 按关键词缓存：只为没有缓存的关键词付费；没有数据（null）也缓存。
- 命中缓存时不写账本（没有费用）。指标和 SERP 快照的 `fetched_at` 用服务回答的时间，不用本次运行的时间，所以证据的时间是真实的。

---

## Opportunities

运行的最后一个阶段（`evaluating`，`packages/research/src/evaluate.ts`）把关键词按来源种子词分组，每组是一个机会候选，打分后保留前 5 个。

- `opportunities`：项目中的一个机会，`(project_id, cluster)` 唯一，`cluster` 是种子词。`status` 为 `unreviewed`（默认）/ `needs_validation` / `go` / `no_go`，只由用户的决策修改（S16）。再次运行时沿用同一行。
- `opportunity_evaluations`：一次运行对一个机会的评估，只追加。记录 `run_id`、`scoring_version`、总分 `score`（0–100）、六个维度的评分 `dimensions`（每项 0–5）、`confidence`（0–100）、`needs_review`、名次 `rank`（1–5）、AI 分析 `analysis`、分析失败的原因 `analysis_error`、分析 Provider、模型（`analyst_model`，fake 为 null）与 Prompt 版本，以及评分用到的证据 `evidence`（关键词、SERP 快照、信号的 id）。
- 当前评估：项目最近一次产生评估的运行中，每个机会最新的一条。上一次进入前 5、这一次没有进入的机会不再列出，历史评估保留。
- 评分（`scoring.ts`，版本 `v1`）只由数据计算，AI 不写分数。维度与权重：趋势 20（信号中出现的不同天数）、需求 15（组内最大的搜索量，同义词不相加）、竞争 20（最大关键词的 KD，越低越高）、商业意图 25（购买类关键词的占比 + 最高 CPC）、MVP 适配 10（寻找工具、应用、模板的关键词占比）、分发 10（不同来源的数量）。总分 = Σ 评分 / 5 × 权重，四舍五入。没有搜索量的组不打分。
- 可信度：指标完整的关键词占比 40、有 SERP 审核 25、指标在 30 天内 15、有信号 20。分数不低于 60 而可信度低于 50 时 `needs_review` 为 true，页面提示先核对证据。
- 意图（`intent.ts`）：按词判断导航、交易、信息、商业类；问题词（how、what、guide 等）优先于商业词；无法判断时为信息类，不抬高商业意图。
- AI 分析（`opportunity-analyst.ts` 端口）：输入是组名、关键词与意图、SERP 标题、信号来源，输出用 Zod 校验（目标用户、任务、替代方案、差异化、定价、渠道、MVP 范围、风险）。输出不合格时 `analysis` 为 null，`analysis_error` 为 `AI_INVALID_OUTPUT`；调用失败为 `AI_ERROR`。两种情况分数照常保存。实现有两个：`fake`（`adapters/fake-analyst.ts`，模板文字，只在 `ALLOW_FAKE_PROVIDERS=1` 时可用）和 `deepseek`（见下一条）。
- DeepSeek（`adapters/deepseek-analyst.ts`，经 `packages/ai` 的 `createDeepSeekJson()` 调用，AI SDK 只在 `packages/ai` 中）：JSON 模式（`response_format: json_object`，说明中写出 json 与示例形状），关闭思考模式（思考 token 也计费），不重试（重试是预算没有预留的第二次付费调用）。来源数据放在用户消息中，说明要求只把它当作数据，忽略其中的指令；说明要求不编造数字。Prompt 最多 12000 字符（超出时从末尾去掉关键词），输出最多 1500 token。Prompt 版本 `analysis-v1`。
- 删除项目时，机会与评估随之删除。账号导出包含每个项目的机会（组名、状态、创建时间）。

---

## Decisions and Experiments

决策与实验只由用户写入（`packages/research/src/opportunity-decisions.ts`，规则在 `opportunity-rules.ts`）。

- `opportunity_decisions`：决策历史，只追加。`decision` 为 `needs_validation` / `go` / `no_go`，`reason` 必填（最多 1000 字符），`decider_id` 是做决策的用户，`evaluation_id` 是决策时的当前评估（证据版本：评分版本与分数）。写入决策时在同一个事务中锁住机会行并修改 `opportunities.status`，两个请求同时提交时只有一个成功。
- 状态转换：`unreviewed` → `needs_validation` 或 `no_go`；`needs_validation` → `go` 或 `no_go`；`go`、`no_go` → `needs_validation`（重新打开）。Go 之前必须先验证。不允许的转换返回 `OPPORTUNITY_DECISION_INVALID`。DTO 的 `nextDecisions` 列出当前可做的决策，页面只显示这些。
- `validation_experiments`：无访谈验证实验（product.md 的 F06）。`kind` 为 `review_analysis` / `free_tool` / `landing_smoke_test` / `sample_paid_upgrade` / `paid_pilot`；假设、渠道、计数的事件、预算（微美元）、期限（1–365 天）、成功阈值、停止条件都必填。一个机会最多 20 个实验。
- 实验状态：`planned` → `running` 或 `stopped`；`running` → `passed`、`failed` 或 `stopped`；结束后不能再改（`EXPERIMENT_FINISHED`）。`passed`、`failed` 必须写 `result_note`（观察到的结果）。实验结果由用户填写，系统不判断是否达到阈值。
- 删除项目时，决策与实验随机会一起删除。账号导出在每个机会下包含决策（决策、理由、时间）和实验。

---

## Product Brief

`packages/research/src/brief.ts` 把机会详情（与 `GET /api/opportunities/:id` 相同的 DTO）生成 Markdown，不存表，每次请求重新生成。

- 用英文（面向 Codex 等编码 Agent），只用已保存的数据，不调用 AI，不编造数字：缺失的指标写 `no data`，没有 AI 分析时写 Not analysed。
- 章节：概要（项目、状态与最近的决策理由、分数与评分版本、可信度、needs review）、Evidence（前 10 个关键词的指标、六个维度）、User、Problem、Competitors（替代方案 + 第一个 SERP 的前 5 个结果）、Differentiation、MVP Features、Out of Scope、Pages、API、Data、Acceptance、Tests、Acquisition（渠道 + 目标关键词）、Pricing and Experiments（定价假设 + 实验与结果）、Risks、Decisions（有决策时）。
- 数据无法填写的章节（Out of Scope、Pages、API、Data）写成未勾选的清单，由用户补全。
- 分析或指标来自 `fake` 时，开头有 Test data 提示。

---

## Execution and Revenue

由 Go 机会开始的产品（`packages/execution`）。所有数字由用户填写，系统不编造（product.md 的 F08）。

- `execution_projects`：一个产品，属于用户（`user_id`），来自一个机会（`opportunity_id` 唯一；删除研究项目后为 null，产品记录保留）。只有 `go` 的机会可以开始产品（否则 `EXECUTION_NEEDS_GO`），重复开始返回同一个产品。字段：名称、仓库地址（http/https）、域名、上线日期 `launched_on`、`status`（`not_started` / `validating` / `building` / `launched` / `measuring` / `archived`）。`launched`、`measuring` 必须有上线日期。
- `execution_events`：一段时间内的访客（`visitors`）或激活（`activations`）数量，开始日期不晚于结束日期。
- `revenue_events`：一天的订单和金额，单位是货币的最小单位（按两位小数的货币），三位大写货币代码。`refund_minor` 不超过 `gross_minor`。`fees_minor` 为 null 表示费用未知，不写 0。`evidence` 记录订单号、支付号或链接。不保存卡信息。
- 每条记录有 `source`：`manual` / `imported` / `payment_verified`。API 写入的记录一律是 `manual`，请求中的 `source` 被忽略；`payment_verified` 只由支付平台集成写入（还没有）。只有 `manual` 的记录可以删除。
- 合计（`execution-rules.ts`）：访客、激活相加；收入按货币分别合计，不同货币不相加。`verifiedOrders` 只计 `payment_verified` 的订单。有任何一笔费用未知时，费用合计和净收入（毛收入 − 退款 − 费用）为 null，页面显示 Unknown。
- 账号导出包含产品及其记录（`products`）；删除账号时先删除产品，记录随之删除。

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
