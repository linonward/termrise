# ADR-010: Ledger Primitives

- Status: Accepted
- Date: 2026-10-08

## Context

CreditService 有一组按订单类型命名的方法：`grantPurchase`、`reversePurchase`、`grantSubscriptionPayment`、`reverseSubscriptionPayment`。这些方法读取并锁定 `purchases`、`subscriptions` 的行，检查订单状态，`reversePurchase` 还写入 PAID → REFUNDED。BillingService 在调用前也锁定同一行。

这样有三个问题：

- 订单规则写在两个包中。每增加一种付款事件，`packages/billing` 和 `packages/credits` 都要修改。S04a–S06a 中，`billing-service.ts` 改了 8 次，`credit-service.ts` 改了 4 次。
- 锁顺序（订单 → 用户余额）由两个包的注释共同约定。只改一边就可能死锁。
- 增加新的 Credits 来源（例如推荐奖励）时，必须先在 CreditService 中加一个专用方法。

## Decision

- CreditService 只提供账本原语：`grant(entry)`、`reverse(entry)`、`findEntry(idempotencyKey)`，以及只读方法 `getBalance()`、`listActivity()`。
- `grant` 每个幂等键只增加一次正数 Credits。`reverse` 每个幂等键只扣回一次，以余额为上限，返回 `shortfall`；扣回为 0 时不写 Ledger。这两条是账本规则，留在 CreditService。
- 订单规则移到 BillingService：何时发放、何时扣回、扣回多少、PAID → REFUNDED、退款早于付款时失败重试。BillingService 先锁定订单行，再调用 CreditService，锁顺序只在一处决定。
- 余额仍然只经 CreditService 修改（[ADR-002](002-credit-ledger.md)）。幂等键格式不变，已有 Ledger 数据不需要迁移。

## Alternatives

- **保持现状**：改动最少，但每种新的付款事件都要同时修改两个包。
- **CreditService 接收回调，在锁内执行订单逻辑**：锁顺序仍由 CreditService 决定，但订单代码变成回调，读起来更难，测试也更难。
- **把 Task 的扣费也改为原语**：方向相同，但 Task 还在 `apps/web` 中，要和 TaskService 的位置一起处理。留给后续 Slice。

## Consequences

- `docs/architecture/data-model.md#creditservice` 和 `docs/architecture/billing.md` 的流程改为 `grant()` / `reverse()`。
- 原来 CreditService 中的订单测试（PENDING 不发放、REFUNDED 记住 0 扣回、退款早于付款）由 BillingService 的集成测试覆盖。CreditService 测试只覆盖原语：幂等、并发、余额上限、回滚。
- `listActivity()` 仍然 join `purchases`、`subscriptions` 来显示 `pack_id` / `plan_id`。这是只读展示，不改变订单状态。
- `debitTask()` / `refundTask()` 仍然读取 `tasks` 的状态，留给后续 Slice。

2026-10-08 修订（S13）：`debitTask()` / `refundTask()` 改为原语 `debit()` / `refund()`，Task 的状态规则移到 TaskService。TaskService 是示例业务代码，留在 `apps/web`，不移到 `packages/*`：新产品要替换它；只有一个同步示例，无法证明抽象适合异步任务。
