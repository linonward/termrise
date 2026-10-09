# ADR-002: Credit Ledger

- Status: Accepted
- Date: 2026-10-05

## Context

Credits 就是钱：购买、扣费、失败退款、支付退款都会改余额，且 webhook 会重复送达、并发到达。出错时必须能回答“这个用户的余额为什么是这个数”。

## Decision

- 只追加的 `credit_transactions` 账本，每条记录 `amount` 和 `balance_after`。
- `user.credit_balance`（Better Auth 的 `user` 表）作为余额缓存，与账本在同一事务内更新；数据库 `CHECK (credit_balance >= 0)` 兜底。
- 每种交易有确定的 `idempotency_key`（唯一约束），重复事件写入失败即视为已处理。
- 余额只能经 CreditService 修改。

Schema、交易类型、幂等键、不变量见 [Credit Ledger](../architecture/data-model.md#credit-ledger) 和 [CreditService](../architecture/data-model.md#creditservice)。

## Alternatives

- **只存余额**：无法审计，也无法做幂等。
- **只存账本、每次求和**：读余额要聚合，且扣费时的“余额不足”判断需要锁住整组记录；缓存余额 + 行锁更简单。
- **第三方计费系统**：引入新依赖，小规模产品不需要。

## Consequences

- 每次改余额都是一个“锁用户行 → 写账本 → 更新余额”的事务，数据库驱动必须支持交互式事务（见 [Database](../architecture/overview.md#database)）。
- 账本可以直接用来对账和排查。
