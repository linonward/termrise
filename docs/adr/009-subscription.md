# ADR-009: Subscription

- Status: Accepted
- Date: 2026-10-08

## Context

Starter 只卖一次性 Credit Pack（[ADR-004](004-payment-provider.md)）。部分产品的用户会持续使用，需要按月付费、自动续费。新增订阅不能改变现有的扣费、退款和 Ledger 规则（[ADR-002](002-credit-ledger.md)），也不能让 Credit Pack 停止工作。Waffo 的订阅行为已在 test 环境实测，见 [Subscription Spike](../payment-provider-spike.md#subscription-spike)。

## Decision

- **订阅每期发放 Credits。** 订阅不是无限使用，也不解锁功能。每次扣款成功，按方案发放固定数量的 Credits，与 Credit Pack 共用余额和 Ledger。TaskService 和扣费逻辑不变。
- **Credits 不过期。** 订阅发放的 Credits 与购买的 Credits 相同，取消订阅后仍可使用。
- **Credit Pack 保留。** 用户可以同时订阅和购买 Credit Pack。
- **方案只在服务端定义。** `SUBSCRIPTION_PLANS`（`packages/billing`）定义每个方案的价格、周期和每期 Credits；每个方案对应一个 Waffo 订阅商品。客户端只提交 `planId`。
- **一个用户最多一个已付款订阅。** 已付款指收到过首期付款或激活事件、且没有 `canceled`。未付款的 `pending` 不拦截：新的 Checkout 取代它（改为 FAILED），用户关掉 Waffo 页面后可以立即重试；被取代的会话如果仍被付款，照常发放 Credits 并告警人工处理（2026-10-08 修订）。更换方案先取消，到期后再订阅；不接 Waffo 的 plan change。
- **按 `subscription.payment_succeeded` 发放 Credits。** 首期、续费、逾期补扣成功都发这个事件，`eventId` 是 Payment ID，每次扣款不同。幂等键为 `subscription-payment:{paymentId}:credit`。每期 Credits 以订阅创建时的快照为准，不重新读取 `SUBSCRIPTION_PLANS`。
- **用我们的订阅 ID 关联用户。** 先创建本地 PENDING 订阅记录，再把它的 ID 作为 `orderMerchantExternalId` 传给 Waffo。所有订阅事件都带回这个值，所以 `payment_succeeded` 先于 `activated` 到达时也能发放。
- **订阅状态只从带 `orderStatus` 的事件更新。** 事件不保证顺序：只有事件 `timestamp` 晚于已保存的状态时间才更新。不使用 `periodNumber` 计数，不依赖 Webhook 中的周期日期。
- **取消在站内完成。** `/billing` 提供取消入口，服务端调用 Waffo 商户 API，订阅进入 `canceling`，到期后 `canceled`。站内不提供恢复：商户 API 不能恢复 `canceling`，用户到期后重新订阅。
- **续费失败不收回 Credits。** `past_due` 只改状态，不发放；渠道重试成功时由 `payment_succeeded` 发放；再次失败订阅变为 `canceled`。
- **退款按期扣回。** `refund.succeeded` 带被退款的 `paymentId`，用它找到对应那期的发放，按退款比例扣回 Credits，向上取整；余额不足时扣到 0 并告警，规则与 Credit Pack 相同。幂等键为 `subscription-payment:{paymentId}:reversal`。退款不改变订阅状态；要「退款并取消」时，另外调用取消。
- **Webhook 去重保持 `eventType` + `eventId`。** 实测中带后缀的事件 `id` 与 `eventId` 不同，只用 `id` 会丢掉续费事件。

## Alternatives

- **订阅期内无限使用（方案 B）**：TaskService 要增加权限判断，成本没有上限，Unit Economics 无法按次计算。
- **每期 Credits 到期清零**：每笔 Credits 要记录来源和到期时间，扣费要决定扣哪一批，Ledger 规则大幅变化。
- **按 `subscription.renewed` 发放**：不带付款金额；test 环境模拟续费会把周期压缩到同一天，第二次 `renewed` 被合并、不投递。
- **只用 Waffo Customer Portal 管理订阅**：没有免登录链接，用户要再收一次 Waffo 的 Magic Link，体验差；取消入口不在我们的产品中。
- **接入 plan change**：要处理按比例补差、即时与下期生效两种时机和更多事件，第一版不需要。

## Consequences

- `docs/product/product.md` 的 What We Are NOT Building 删除 Subscription，Business Model 和 Unit Economics 增加订阅方案。
- 新增 `subscriptions` 表；`credit_transactions.type` 增加 `SUBSCRIPTION_GRANT` 和 `SUBSCRIPTION_REVERSAL`；CreditService 增加对应方法。
- `PaymentProvider` 增加订阅 Checkout 和取消；`PaymentWebhookEvent` 增加订阅付款和状态事件；Waffo 与 Fake 适配器同步实现。
- `pnpm waffo:products` 同时同步订阅商品。
- Landing、Pricing、SEO 文案和 Terms、Refund Policy 中「没有订阅」的内容要重写，并写清自动续费、取消和退款规则；对应的 E2E 断言同步修改。
- 测试必须覆盖：重复投递只发放一次；`payment_succeeded` 先于 `activated` 到达；旧状态事件晚到不覆盖新状态。

## Open

- **`canceling` 到期变为 `canceled`** 需要 Waffo 支持在 test 环境推进，尚未实测。
