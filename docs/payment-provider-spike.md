# Payment Provider Spike

日期：2026-10-05。Provider：Waffo Pancake（Merchant of Record）。SDK：`@waffo/pancake-ts` 0.25.0。本节在 ClipSKU 中实测，脚本留在 ClipSKU 仓库；文中的价格（例如 Starter $9）是 ClipSKU 当时的价格，不是本仓库的 `CREDIT_PACKS`。

## 结论

| 项            | 结论                                                                                                                                   |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 产品          | Waffo Pancake（MoR）：Waffo 作为卖方处理税务与合规，不需要公司主体                                                                     |
| Credit Pack   | 每个 Pack 对应一个 Waffo 一次性商品，按 `packId` 映射 Product ID                                                                       |
| 关联 Purchase | `purchaseId` 作为 `orderMerchantExternalId` 传入，实测在 webhook `data.orderMerchantExternalId` 原样返回                               |
| Webhook 验签  | RSA-SHA256，`X-Waffo-Signature: t=<ms>,v1=<base64>`；SDK `verifyWebhook()` 实测通过，篡改请求体与错环境被拒                            |
| 去重          | `eventType` + `eventId`（实测 `id` 与 `eventId` 相同，都是业务 ID，不是投递 UUID）                                                     |
| 付款失败      | 一次性商品没有失败事件；卡被拒或放弃支付时不发 webhook，PENDING Purchase 需要自己过期                                                  |
| 退款事件      | `refund.succeeded` 已实测（Dashboard 部分退款 $1.00 / $9.00），带 `purchaseId` 与 `refundedAmount`；部分退款后订单状态仍为 `completed` |
| 手续费        | 3.9% + $0.50 / 笔（官方费率，test 环境不结算，未能实测）                                                                               |
| 上线前置条件  | 域名验证 → KYB 审核（1–3 个工作日）→ 商品 publish 到 prod；AIGC 产品有额外审核要求                                                     |

## Checkout（已实测）

- `client.checkout.createSession({ productId, currency: "USD", buyerEmail, successUrl, orderMerchantExternalId, metadata })`，对应 `POST https://api.waffo.ai/v1/actions/checkout/create-session`。
- 必须先有商品（`client.onetimeProducts.create`，价格为字符串 `"9.00"`，不是美分）。可用 `priceSnapshot` 覆盖单次价格，MVP 不需要。
- 返回 `{ sessionId: "cs_…", checkoutUrl, expiresAt }`，默认 45 分钟过期。**此时没有 Order ID**，Order ID 和 Payment ID 只在 webhook 中出现。
- 没有 `cancelUrl`（官方文档：传入会被静默忽略）。`successUrl` 必须是绝对 https URL；买家付款后点击 Done 才跳转，查询参数原样保留。实测 webhook 先于跳转到达。
- 写操作的幂等键 `X-Idempotency-Key`（SDK `{ idempotencyKey }`）只允许字母、数字、`-`、`_`，最长 256，缓存 24 小时；官方建议以 Merchant ID 为前缀。SDK 不会自动生成。
- 环境由 API Key 决定（每个 Key 创建时绑定 test 或 prod），请求不带环境参数。

## Webhook（已实测）

- 注册：Dashboard 或 `client.webhooks.add({ storeId, channel: "http", url, events, testMode })`，test / prod 分开注册。
- 请求头：`X-Waffo-Signature`、`X-Waffo-Event`；User-Agent 为 `Upstash-QStash`。
- 签名：对 `${t}.${rawBody}` 做 RSA-SHA256，用 Waffo 平台公钥（SDK 内置，分 test / prod）验证。必须用 `request.text()` 取原始请求体。SDK 默认时间戳容差 45 分钟（重试沿用首次的 `t`），未来容差 1 分钟。
- 重试：失败后最多重试 3 次，指数退避，响应超时 10 秒，无手动重发（官方文档）。

`order.completed` 实测（Starter，$9）：

| 字段                           | 值                                                                       |
| ------------------------------ | ------------------------------------------------------------------------ |
| `id` / `eventId`               | `PAY_4zEBE7Ml3JZwPQEJ2q6gDr`（两者相同）                                 |
| `eventType`                    | `order.completed`                                                        |
| `mode`                         | `test`                                                                   |
| `data.orderId`                 | `ORD_05n7alR0iGcsEQ94IgCZ0N`                                             |
| `data.paymentId`               | `PAY_4zEBE7Ml3JZwPQEJ2q6gDr`                                             |
| `data.orderMerchantExternalId` | `purchaseId`                                                             |
| `data.orderMetadata`           | `{ purchaseId, userId }`（checkout 时传入的 `metadata`）                 |
| `data.productMetadata`         | `{ packId: "starter" }`                                                  |
| `data.orderStatus`             | `completed`                                                              |
| `data.paymentStatus`           | `succeeded`                                                              |
| 金额                           | `amount` / `chargedAmount` / `total` 均为 `"9.00"`，`taxAmount` `"0.00"` |

## Refund（已实测）

Dashboard 发起部分退款 $1.00（原付款 $9.00）。退款申请创建于 2026-10-05 06:28:06 UTC，执行成功于 07:00:02 UTC，耗时约 32 分钟（GraphQL `refundTickets.createdAt` / `executedAt`）。最终收到 `refund.succeeded`，验签通过：

| 字段                             | 值                                                  |
| -------------------------------- | --------------------------------------------------- |
| `id` / `eventId`                 | `REF_4AmMxRhzAYhv6uV1iEcyVu`（两者相同）            |
| `data.orderId`                   | `ORD_05n7alR0iGcsEQ94IgCZ0N`（与付款事件相同）      |
| `data.paymentId`                 | `PAY_4zEBE7Ml3JZwPQEJ2q6gDr`                        |
| `data.orderMerchantExternalId`   | `purchaseId`（继承自订单）                          |
| `data.orderMetadata`             | `{ purchaseId, userId }`                            |
| `data.amount` / `refundedAmount` | `"1.00"`（本次退款金额）                            |
| `data.originalPayment.total`     | `"9.00"`                                            |
| `data.refundStatus`              | `succeeded`；`refundReason` `requested_by_customer` |
| `data.orderStatus`               | 仍为 `completed`，`paymentStatus` 仍为 `succeeded`  |

- 只发最终结果 `refund.succeeded` / `refund.failed`，没有"退款中"事件。
- **部分退款也发 `refund.succeeded`**，不能按事件类型判断全额退款；需要比较 `refundedAmount` 与实付金额。实付金额应取 `originalChargedAmount`：之后核对 SDK 文档确认，`originalPayment.total` 是标价，有折扣时与实付不同。部分退款按比例扣回 Credits，见 [Purchase Refund](architecture/billing.md#purchase-refund)。
- 发起：Dashboard、Customer Portal，或客户会话 `createRefundTicket`；商户 API Key 的 SDK 没有直接退款方法（官方文档）。一次性商品退款窗口 14 天；每笔付款只能有一条退款记录（重复创建返回 409）。

## Sandbox 与 Production 的差异

| 项      | Test                                         | Production                                                            |
| ------- | -------------------------------------------- | --------------------------------------------------------------------- |
| API Key | test Key                                     | 单独的 prod Key                                                       |
| 商品    | 在 test 创建                                 | `client.onetimeProducts.publish({ id })` 复制到 prod，Product ID 不变 |
| Webhook | `testMode: true` 单独注册                    | 单独注册                                                              |
| 付款    | 测试卡 `4576 7500 0000 0110`（`…0220` 拒付） | 真实支付                                                              |
| 开通    | 立即可用                                     | 域名验证 + KYB 审核通过后才能收款，否则 403                           |
| 结算    | 不结算                                       | 按手续费结算，提现 1%（最低 $10）                                     |

## 手续费

[官方费率](https://docs.waffo.ai/mor/fees)：卡 / 钱包 3.9% + $0.50 / 笔（按含税金额计）；退款每次 $1.00，原手续费不退；Chargeback $25；提现 1%（最低 $10）。test 环境不结算，实际费率以首笔真实结算为准。

## 上线审核

[Account Reviews](https://docs.waffo.ai/mor/account-reviews) 与 [AIGC Compliance](https://docs.waffo.ai/mor/account-reviews/aigc-compliance)：

- 公开可访问的站点（无登录墙）、可见价格、Terms、Privacy、与提交一致的支持邮箱。
- 独立品牌，不把模型品牌当作自己的产品名；如实披露使用的模型。
- 提示词与生成结果的内容审核，维护屏蔽词表并保留审核日志。
- 公开 AUP（或 Terms 中的章节），逐项列出禁止内容：NSFW、暴力血腥、仇恨、CSAM、深度伪造 / 冒充、侵犯版权 / 商标；说明处置方式、举报渠道和审核流程。
- 建议：标注 AI 生成、提供申诉渠道。

## Subscription Spike

日期：2026-10-08。SDK：`@waffo/pancake-ts` 0.25.0。目的：为订阅（每期发放 Credits，Credits 不过期）确认 Waffo 的实际行为。实测脚本 `apps/web/scripts/waffo-subscription-spike.ts` 在订阅上线后已删除，需要时从 git 历史中找回。

实测对象：test 商品 `PROD_64DW1A4PSclnPFgOg1M5IZ`（月付 $9.90）；订单 A `ORD_5QaU68WGdqZ92BQIuX8jkw`（首期、两次续费、逾期恢复、取消、退款）；订单 B `ORD_4t39H7ltUvboGtlxXzxhLG`（连续两次失败）。

### 结论

| 项              | 文档                                                                                                                                                  | 实测                                                                                                                                                                                                                                                                                                                                                                       |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 商品            | `client.subscriptionProducts.create({ storeId, name, billingPeriod, prices })`，周期 `weekly` / `monthly` / `quarterly` / `yearly`；`publish` 到 prod | 创建成功，返回 `PROD_…`。未测 publish                                                                                                                                                                                                                                                                                                                                      |
| Checkout        | 与一次性商品同一个 `create-session`；`checkout.authenticated.create` 额外传 `buyerIdentity`。订阅只支持 `card` / `applepay` / `googlepay`             | 成功。返回的 URL 带 `#token=…`，客户 Token 约 15 分钟过期（Session 仍为 45 分钟）                                                                                                                                                                                                                                                                                          |
| 关联用户        | `orderMerchantExternalId` 由订单继承到付款和退款事件                                                                                                  | 所有订阅事件都带 `orderMerchantExternalId`、`orderMetadata`（`userId`、`subscriptionId`）和 `merchantProvidedBuyerIdentity`                                                                                                                                                                                                                                                |
| 发放 Credits    | `subscription.payment_succeeded`：首期、续费、逾期补扣各一次；`eventId` = Payment ID                                                                  | 一致。每次扣款都有新的 Payment ID；带 `chargedAmount`、`listPrice`、`periodNumber`；不带 `orderStatus` 和周期日期                                                                                                                                                                                                                                                          |
| 事件顺序        | `activated` / `renewed` 与 `payment_succeeded` 独立投递，不保证顺序                                                                                   | 一致。首期 `payment_succeeded` 先到（早约 1.7 秒）；续费 `renewed` 先到（早约 0.4 秒）                                                                                                                                                                                                                                                                                     |
| 去重            | 同一 `eventType` + `eventId` 只投递一次；`renewed` 的 `eventId` 带新周期结束日期                                                                      | 一致。模拟续费把周期压缩到同一天，第二次续费的 `renewed` 与第一次 `eventId` 相同（`…-renewed-2026-11-08`），**没有投递**；同次的 `payment_succeeded` 正常投递                                                                                                                                                                                                              |
| `periodNumber`  | 失败的扣款也占用一期                                                                                                                                  | 一致。订单 A：1、2、3 成功，4 失败（`past_due`），5 恢复成功。不是成功付款次数                                                                                                                                                                                                                                                                                             |
| 周期日期        | `renewed` 带新周期的 `currentPeriodStart/End`                                                                                                         | test 模拟续费后 Webhook 中 start = end = 2026-11-08；GraphQL 中周期只有 48 秒。test 环境的周期日期不可用，生产环境未知                                                                                                                                                                                                                                                     |
| 续费失败        | `past_due`；渠道只重试一次，成功 → `recovered`，失败 → 立即 `canceled`                                                                                | 一致。订单 A：`past_due` → success → `payment_succeeded` + `recovered`。订单 B：两次失败 → `past_due` → `canceled`（不经过 `canceling`）。`past_due` 不带失败原因                                                                                                                                                                                                          |
| 取消            | 商户 `client.orders.cancelSubscription({ orderId })`：active → `canceling`，到期后 `canceled`                                                         | API 返回 `canceling`，收到 `subscription.canceling`（带 `canceledAt`）。`canceling` → `canceled` 无法自助模拟（需 Waffo 支持推进），**未实测**                                                                                                                                                                                                                             |
| 恢复            | 只有客户会话 `customer.reactivateSubscription` 或 Customer Portal 可以恢复 `canceling`                                                                | 未实测                                                                                                                                                                                                                                                                                                                                                                     |
| Customer Portal | 统一入口，Magic Link 登录；没有免登录链接的 API                                                                                                       | 未实测                                                                                                                                                                                                                                                                                                                                                                     |
| 退款            | 见冲突 1                                                                                                                                              | Dashboard 可以对订阅付款发起退款。订单 A 第 5 期（`PAY_0PhsWf66yNxKMre8ma1zes`）全额退款约 26 分钟后收到 `refund.succeeded`：`eventId` = Refund ID；带 `paymentId`、`periodNumber`（5）、`refundedAmount`、`originalChargedAmount`、`orderMerchantExternalId`、`orderMetadata`。`orderStatus` 仍为 `canceling`，之后没有其他订阅事件：**退款不改变订阅状态，也不取消订阅** |
| `id`            | 见冲突 2                                                                                                                                              | `payment_succeeded`、`activated`、`canceled` 的 `id` = `eventId`；`renewed`、`past_due`、`recovered`、`canceling` 的 `id` 是不带后缀的订单号，`eventId` 带后缀。**不能只用 `id` 去重**                                                                                                                                                                                     |

### 文档冲突

1. **订阅能否退款**：`features/refunds` 写「Subscriptions do not use the refund ticket system」；`guides/refunds` 给出「Refund + Cancel」流程。实测：可以退款，`refund.succeeded` 正常到达，订阅状态不变。`features/refunds` 的说法不准确。
2. **`id` 的含义**：SDK `webhook-guide` 写 `id` 是投递记录 UUID；API 参考写「same as `eventId` for most events」。实测：两者都不准确，`id` 是业务实体 ID（Payment ID 或订单号），带后缀的事件中与 `eventId` 不同。去重继续用 `eventType` + `eventId`。
3. **`subscription.canceling` 的 `eventId`**：Event Types 总表写 Order ID，eventId Mapping 表写 Order ID + 时间戳。实测：带时间戳（`ORD_…-2026-10-08T03:59:50.935Z`），Mapping 表正确。
4. **能否立即取消**：`guides/subscriptions` 写没有立即取消；SDK 注释写 past_due 时立即生效。实测：渠道第二次失败时订阅立即变为 `canceled`；商户在 past_due 时调用取消未测。

### 对设计的影响

- 按 `subscription.payment_succeeded` 发放 Credits，幂等键用 Payment ID。不按 `renewed` 发放：它在 test 环境会被合并，且不带付款金额。
- 发放 Credits 不能依赖订阅状态事件先到。用 `orderMerchantExternalId`（我们的订阅 ID）关联用户，`payment_succeeded` 先到时也能发放。
- 订阅状态只从带 `orderStatus` 的事件更新。事件乱序时，不能让旧事件覆盖新状态（例如按事件 `timestamp` 比较）。
- 不使用 `periodNumber` 计数，也不依赖 Webhook 中的周期日期。
- Webhook 去重保持 `eventType` + `eventId`。
- 退款按 `refund.succeeded` 的 `paymentId` 找到对应的那期发放，扣回该期 Credits。退款不会取消订阅：要「退款并取消」时，另外调用取消。

### 实测清单

- [x] 商品：创建月付测试商品
- [x] Webhook：注册 test webhook，记录每次投递（邮箱已脱敏）
- [x] 首期：创建 Checkout → 测试卡付款
- [x] 续费：两次「Simulate renewal success」
- [x] 逾期：「Simulate renewal failure」→「Simulate renewal success」
- [x] 取消：商户取消订单 A → `canceling`
- [x] 退款：订单 A 第 5 期全额退款 → `refund.succeeded`，订阅状态不变
- [x] 终止：订单 B 连续两次「Simulate renewal failure」→ `canceled`
- [x] 冲突 2：对比每条投递的 `id` 与 `eventId`
- [ ] 未实测（不阻塞设计）：`canceling` 到期变为 `canceled`、客户恢复订阅、Customer Portal、publish 到 prod
