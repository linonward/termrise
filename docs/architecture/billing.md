# Billing

## Payment Architecture

本文描述 Credit Pack 与订阅。订阅的规则集中在 [Subscriptions](#subscriptions)。

Termrise 暂不收费：`product.config.ts` 的 `billingEnabled: false` 隐藏全部收费入口（Pricing、Billing、Credits、退款政策，见 ux.md 的 Pages），`signupBonusCredits: 0`。本文的代码、API 和 webhook 仍然存在并有测试，打开开关即恢复。

Provider：

```text
Waffo
```

但是 Domain 不知道 Waffo。

调用：

```text
Route Handler
↓
BillingService
↓
PaymentProvider
↓
WaffoProvider
↓
Waffo
```

BillingService 的代码（`packages/billing/src/`）：

| 文件                   | 内容                                                                                    |
| ---------------------- | --------------------------------------------------------------------------------------- |
| `billing-service.ts`   | 入口：解析 Checkout 输入，Webhook inbox 去重，按事件类型分发，发送 `purchase_completed` |
| `purchase-flow.ts`     | Credit Pack：Checkout、`payment.succeeded` / `payment.refunded`、购买列表               |
| `subscription-flow.ts` | 订阅：Checkout、付款 / 状态 / 退款事件、当前订阅、取消、Checkout 结果                   |
| `flow.ts`              | 共用：Transaction 类型、Pending 过期时间、按比例扣回的 `refundCredits()`                |

新增一种收费方式时，新增一个 flow 文件，在 `billing-service.ts` 中分发；不改其他 flow。

---

## PaymentProvider

```ts
export interface PaymentProvider {
  readonly name: string;

  /** 用户更新付款方式的页面，Billing 页在 PAST_DUE 时链接到它。 */
  readonly customerPortalUrl: string;

  createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult>;

  createSubscriptionCheckout(
    input: CreateSubscriptionCheckoutInput,
  ): Promise<CreateCheckoutResult>;

  cancelSubscription(input: {
    providerOrderId: string;
  }): Promise<{ status: "CANCELING" | "CANCELED" }>;

  verifyWebhook(request: Request): Promise<PaymentWebhookEvent | null>;
}
```

Provider 相关的 URL 和行为只写在适配器中。页面经 BillingService 读取 `customerPortalUrl`，不写死 Waffo 的地址。

`verifyWebhook()`：

```text
签名无效 → 抛出 `PaymentSignatureError`，Route 返回 401

签名有效但事件类型与业务无关 → 返回 null，Route 返回 200
```

---

## Payment Types

```ts
export type CreditPackId = keyof typeof CREDIT_PACKS; // "single" | "starter" | "creator" | "pro"
export type SubscriptionPlanId = keyof typeof SUBSCRIPTION_PLANS; // "monthly"

export interface CreateCheckoutInput {
  purchaseId: string;
  userId: string;
  email: string;
  packId: CreditPackId;
  amountUsdCents: number;
  successUrl: string;
}

export interface CreateSubscriptionCheckoutInput {
  subscriptionId: string;
  userId: string;
  email: string;
  planId: SubscriptionPlanId;
  successUrl: string;
}

export interface CreateCheckoutResult {
  checkoutUrl: string;
  providerSessionId: string;
}

export type PaymentWebhookEvent =
  | {
      type: "payment.succeeded";
      eventId: string;
      purchaseId: string;
      providerOrderId: string;
      providerPaymentId?: string;
      rawEventType: string;
      payload: unknown;
    }
  | {
      type: "payment.refunded";
      eventId: string;
      purchaseId: string;
      providerOrderId: string;
      refundedAmountUsdCents?: number; // 缺失时按全额退款
      paidAmountUsdCents?: number; // Provider 实际收取的金额；缺失时用 Purchase 的 amount_usd
      rawEventType: string;
      payload: unknown;
    }
  | {
      type: "subscription.payment_succeeded"; // 每次订阅扣款成功：首期和每次续费
      eventId: string;
      subscriptionId: string;
      providerOrderId: string;
      providerPaymentId: string;
      rawEventType: string;
      payload: unknown;
    }
  | {
      type: "subscription.payment_refunded"; // 退款一次订阅付款，订阅本身继续
      eventId: string;
      subscriptionId: string;
      providerOrderId: string;
      providerPaymentId: string;
      refundedAmountUsdCents?: number; // 缺失时按全额退款
      paidAmountUsdCents?: number; // Provider 实际收取的金额；缺失时用方案价格
      rawEventType: string;
      payload: unknown;
    }
  | {
      type: "subscription.status_changed"; // 激活、续费、逾期、恢复、取消后的新状态
      eventId: string;
      subscriptionId: string;
      providerOrderId: string;
      status: "ACTIVE" | "PAST_DUE" | "CANCELING" | "CANCELED";
      occurredAt: string; // Provider 事件时间（ISO 8601），用于给乱序到达的事件排序
      currentPeriodEnd?: string; // ISO 8601 日期或时间；部分事件没有
      rawEventType: string;
      payload: unknown;
    };
```

没有 `cancelUrl`：Waffo 不支持取消跳转，发起 Checkout 的页面自己提供返回入口。

创建 Checkout 时 Waffo 只返回 Checkout Session ID，没有 Order ID。`providerSessionId` 单独保存，不得当作 `providerOrderId`；`providerOrderId` 由 webhook 回填。`purchaseId` 作为 Waffo 的 `orderMerchantExternalId` 传入，webhook 用它关联 Purchase。

Waffo 原始事件必须先 normalize 成上述 Domain Event。`eventId` 在同一 Provider 内必须唯一（Waffo 用 `eventType` + `eventId` 拼接）。

没有 `payment.failed`：Waffo 一次性付款在拒付或放弃支付时不发事件。PENDING Purchase 由我们自己过期，见 [Pending Expiry](#pending-expiry)。

`payload` 只用于写入 `payment_events`，业务层不得读取 Waffo-specific payload。

---

## Credit Packs

服务端维护唯一价格真相：

```ts
export const CREDIT_PACKS = {
  single: { credits: 10, priceUsd: 590 },
  starter: { credits: 50, priceUsd: 1990 },
  creator: { credits: 150, priceUsd: 4990 },
  pro: { credits: 280, priceUsd: 7990 },
} as const;
```

`priceUsd` 单位为美分。这些价格是占位值：新产品按自己的成本和定价改写（`packages/billing/src/credit-packs.ts`），同时同步 Waffo 商品。

页面上的次数、单价和节省比例由 `packPricing()`（`packages/billing/src/pack-pricing.ts`）计算：

```text
uses        = floor(credits / TASK_CREDIT_COST)
perUseCents = round(priceUsd / uses)
savingPercent = floor((1 - 单价 / Single 的单价) × 100)，Single 为 null
```

节省比例**向下取整**，不夸大折扣。`TASK_CREDIT_COST` 改变时，次数和单价随之改变。

客户端只能提交：

```json
{
  "packId": "starter"
}
```

禁止接受：

```json
{
  "credits": 10000,
  "price": 9
}
```

Credits 和价格必须由服务端根据 `packId` 解析。

Webhook 到达时，发放的 Credits 以 `purchases.credits` 为准（创建时快照），不重新读取 `CREDIT_PACKS`。

---

## WaffoProvider

使用官方 SDK `@waffo/pancake-ts`。

Credit Pack 与 Waffo 一次性商品一一对应，映射在代码中维护（`WAFFO_PRODUCT_IDS`）。商品在 test 环境创建，publish 到 production 后 Product ID 不变。Waffo 后台的商品价格必须与 `CREDIT_PACKS` 一致，用 `pnpm waffo:products` 同步（默认只打印计划；`--apply` 更新或创建，`--publish` 发布到 production）。改价的上线顺序在 runbook 的 Change Prices。新产品要在自己的 Waffo Store 中创建商品，再更新 `WAFFO_PRODUCT_IDS`。

Starter 中 `WAFFO_PRODUCT_IDS` 的值都是空字符串。执行 `pnpm waffo:products --apply` 并写入 ID 之前，`PAYMENT_PROVIDER=waffo` 的 Checkout 无法使用。

createCheckout()：

```text
checkout.createSession
  productId               = WAFFO_PRODUCT_IDS[packId]
  currency                = USD
  buyerEmail              = email
  successUrl              = successUrl
  orderMerchantExternalId = purchaseId
  metadata                = { purchaseId, userId }
X-Idempotency-Key = {merchantId}-checkout-{purchaseId}
↓
{ checkoutUrl, providerSessionId = sessionId }
```

verifyWebhook()：

```text
request.text()（原始 body）
↓
SDK verifyWebhook()：X-Waffo-Signature，RSA-SHA256，时间戳容差 45 分钟
↓
event.mode 必须等于当前环境
↓
normalize
```

| Waffo 事件                                                                                                | Domain Event                                                                                     |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `order.completed`                                                                                         | `payment.succeeded`                                                                              |
| `refund.succeeded`                                                                                        | `payment.refunded`；`data.orderMetadata.subscriptionId` 存在时为 `subscription.payment_refunded` |
| `subscription.payment_succeeded`                                                                          | `subscription.payment_succeeded`                                                                 |
| `subscription.activated` / `renewed` / `recovered` / `past_due` / `canceling` / `uncanceled` / `canceled` | `subscription.status_changed`（状态取自 `data.orderStatus`）                                     |
| 其他                                                                                                      | `null`（返回 200）                                                                               |

字段：`eventId` = `{eventType}:{eventId}`；`purchaseId` = `data.orderMerchantExternalId`（缺失时取 `data.orderMetadata.purchaseId`）；`providerOrderId` = `data.orderId`；`providerPaymentId` = `data.paymentId`。订阅事件用 `subscriptionId` 代替 `purchaseId`（`data.orderMerchantExternalId`，缺失时取 `data.orderMetadata.subscriptionId`）。

环境：`apps/api` 的 `WAFFO_ENVIRONMENT` binding，Production 为 `prod`（使用 prod API Key），其他环境为 `test`（默认）。web 的页面仍按 `VERCEL_ENV=production` 判断，直到页面改为调用 API。`event.mode` 与当前环境不一致时，按签名无效处理（401）。所以 Preview 或本地使用 prod Key 时，所有 webhook 都返回 401。

Webhook 路由：`apps/api` 的 `POST /api/webhooks/waffo`（`apps/api/src/routes/webhooks.ts`）。`@waffo/pancake-ts` 用 `node:crypto` 的 RSA 签名，S08 在 `wrangler dev`（workerd）上验证过：请求签名可被商户公钥验证，平台签名的 webhook 通过，其他 key 签名的被拒绝。当前 Provider 校验签名：测试环境用 Fake Provider，它只接受自己签名的事件。签名无效 401；与业务无关的事件 200；处理失败 500（Waffo 会重试）。`purchaseId` 不是 UUID、找不到，或属于其他 Provider 时，记录 `billing.unknown_purchase`（warn）并返回 200；订阅事件同样处理，记录 `billing.unknown_subscription`（warn）。

---

## Waffo Payment Flow

```text
Pricing
↓
Select Credit Pack
↓
POST /api/checkout
↓
requireUser()
↓
rate limit
↓
validate packId
↓
Create PENDING Purchase
↓
PaymentProvider.createCheckout()
↓
Waffo Checkout
↓
Payment
↓
Waffo Webhook
↓
Verify Signature
↓
Normalize Event
↓
payment_events
↓
Deduplicate
↓
Purchase = PAID
↓
CreditService.grant()（PURCHASE，幂等键 purchase:{purchaseId}:credit）
↓
PURCHASE Ledger Transaction
↓
Credits Available
```

`Purchase = PAID` 与 `grant()` 在同一事务内完成。

Redirect 不代表付款成功。

禁止：

```text
success redirect
↓
grant credits
```

只有 verified webhook 可以确认付款。

Success redirect 落到 `/billing?checkout=success`，页面显示：

```text
Payment received
Your credits will appear shortly. This page updates automatically.
```

页面每 3 秒通过 `router.refresh()` 重新读取余额和购买记录，最多等待 60 秒；以最新 Purchase 的 `status === PAID` 判定完成，不比较余额变化。隐藏标签页暂停轮询；超时后提示用户稍后刷新，联系支持。只有最新 Purchase 为 PENDING 或 PAID 时才显示提示；REFUNDED、FAILED 或没有 Purchase 时不显示。判定为 PAID 后，用 `history.replaceState` 去掉 URL 中的 `checkout` 参数，刷新页面不再显示提示。文案来自 `messages` 的 `billing.checkoutPending` / `checkoutDone` / `checkoutTimeout`。

---

## Pending Expiry

创建超过 60 分钟仍为 PENDING 的 Purchase 视为未付款，改为 FAILED（Waffo Checkout Session 45 分钟过期，留 15 分钟余量）。

不使用 Cron：`listPurchases()` 读取前先过期当前用户的 PENDING Purchase。

`createCheckout()` 调用 Provider 失败时，Purchase 立即改为 FAILED，接口返回 `PAYMENT_ERROR`。

FAILED Purchase 之后收到已验签的 `payment.succeeded`：钱以支付方为准，Purchase 改为 PAID（回填 Order ID、Payment ID 和完成时间），经 CreditService 发放 Credits，记录 warn 日志 `billing.late_payment`。重复事件不重复发放。

REFUNDED Purchase 收到 `payment.succeeded`：不发 Credits，记录 error 日志 `billing.payment_for_non_pending_purchase`，人工处理。

---

## Purchase Credit Idempotency

购买 Credits：

```text
purchase:{purchaseId}:credit
```

作为：

```text
credit_transactions.idempotency_key
```

同一个成功事件即使收到：

```text
1x
2x
5x
10x
```

最终仍只能产生一条：

```text
PURCHASE +credits
```

---

## Purchase Refund

收到 `payment.refunded`：

```text
Purchase 为 PAID 时执行扣回；已 REFUNDED 时返回已有扣回结果；PENDING 或 FAILED（付款事件迟到或丢失）时失败 → 500，inbox 不标记已处理，Waffo 重试，付款事件到达后的重试正常扣回
↓
target = 退款金额 ≥ 实付金额（或未提供）? purchase.credits
                                     : ⌈purchase.credits × 退款金额 ÷ 实付金额⌉
↓
BEGIN
↓
Purchase = REFUNDED, refunded_at = now()（BillingService）
↓
CreditService.reverse()：reversal = min(target, user.credit_balance)
↓
reversal > 0 → PURCHASE_REVERSAL -reversal
↓
reversal < target → logger.error（当前在 webhook 外层事务内记录，同时上报 Sentry，需人工处理）
↓
COMMIT
```

部分退款按比例扣回，向上取整。例：Creator（150 Credits，$49.90）退 $24.95 → 扣回 75；Starter（50 Credits，$19.90）退 $1 → 扣回 3。

Waffo 每笔付款只能有一条退款记录，所以部分退款后 Purchase 同样是 REFUNDED，之后不会再有第二笔退款。

`payment.refunded` 的 `refundedAmountUsdCents` 和 `paidAmountUsdCents` 由 Provider 提供（Waffo：`data.refundedAmount`、`data.originalChargedAmount`）。`data.originalPayment.total` 是标价，有折扣时与实付不同，不使用（SDK 的 webhook-guide.md）。实付金额用 Provider 的值，不用 Purchase 的 `amount_usd`：改价期间打开的 Checkout 按新价格收款，两者可能不同。Provider 未提供实付金额时，用 `amount_usd`。

Idempotency：

```text
purchase:{purchaseId}:reversal
```

余额永远不得为负。

---

---

## Subscriptions

决策见 ADR-009（`docs/adr/009-subscription.md`），Waffo 实测见 `docs/payment-provider-spike.md` 的 Subscription Spike。订阅 Checkout、每次付款发放 Credits、状态事件、未付款过期、站内取消与退款扣回都已实现。

### Subscription Plans

服务端唯一价格来源：`SUBSCRIPTION_PLANS`（`packages/billing/src/subscription-plans.ts`），每个方案定义每期价格（美分）、每期 Credits 和周期。价格是占位值。每个方案对应一个 Waffo 订阅商品，映射在 `WAFFO_SUBSCRIPTION_PRODUCT_IDS`（`packages/billing/src/adapters/waffo.ts`），为空时生产环境无法创建订阅 Checkout。`pnpm waffo:products` 同时同步订阅商品（名称、周期、价格），用法与 Credit Pack 相同。

Pricing 页（与 Landing 的 Pricing 区块共用）在 Pack 卡片下方为每个方案显示一张订阅卡片：每期价格、每期 Credits、次数、每次价格与 Save（`planPricing()`，与 Pack 用同一套计算）。

### Subscription Checkout

`POST /api/checkout` 的 body 为 `{ planId }` 时创建订阅 Checkout：

```text
requireUser() → rate limit → 校验 planId
↓
BEGIN（按用户的 advisory lock 串行化）
已付款订阅（provider_order_id 非空且不是 CANCELED）→ 409 SUBSCRIPTION_EXISTS
未付款的 PENDING 订阅 → FAILED（新的 Checkout 取代旧的）
INSERT PENDING subscription（价格与 Credits 快照）
COMMIT
↓
PaymentProvider.createSubscriptionCheckout()（Waffo：与 Credit Pack 相同的 checkout.createSession，orderMerchantExternalId = subscriptionId）
↓
失败 → FAILED + PAYMENT_ERROR；成功 → 保存 provider_session_id
```

订阅 Checkout 的 success URL 为 `/billing?checkout=subscription`。Billing 页据此显示与 Credit Pack 相同的付款提示，判断条件是最新的订阅是否已有 `SUBSCRIPTION_GRANT`（`subscriptionCheckoutStatus()`），不看 Purchase。

### Subscription Webhooks

付款事件与状态事件独立投递，到达顺序不固定：

- 两者都回填 `provider_order_id`。回填后该订阅算作已付款。
- `subscription.payment_succeeded`（首期、每次续费、逾期补扣）由 BillingService 经 `CreditService.grant()` 发放该订阅的每期 Credits 快照，幂等键 `subscription-payment:{paymentId}:credit`。不等状态事件，不改状态。
- `subscription.status_changed` 的状态来自 Waffo `data.orderStatus`：

  | `orderStatus`          | 状态      |
  | ---------------------- | --------- |
  | `active`               | ACTIVE    |
  | `past_due`             | PAST_DUE  |
  | `canceling`            | CANCELING |
  | `canceled` / `expired` | CANCELED  |

  其他值（如 `closed`）或缺失时忽略（返回 200）。只有事件时间（Waffo 顶层 `timestamp`，重试不变）晚于 `status_updated_at` 时才更新状态，旧事件晚到不覆盖新状态。事件带 `currentPeriodEnd` 时同时更新 `current_period_end`（test 环境模拟续费的周期日期不可用）。

- 已被取代或已过期（FAILED）的订阅收到事件时照常处理，并记录 `billing.replaced_subscription_paid`（error），人工确认用户是否有两个订阅。

### Current Subscription

`currentSubscription()` 返回用户已付款且不是 CANCELED 的最新订阅（方案、状态、`current_period_end`），供 Billing 页使用。读取前先把超过 60 分钟、仍未付款的 PENDING 订阅改为 FAILED（与 [Pending Expiry](#pending-expiry) 相同，不用 Cron）。

### Cancel Subscription

`POST /api/billing/subscription/cancel`（requireUser，限流与 Checkout 相同）→ `BillingService.cancelSubscription()`：

```text
最新的已付款订阅，状态为 ACTIVE / PAST_DUE / CANCELING；没有 → 404 SUBSCRIPTION_NOT_FOUND
（已付款但 activated 未到的 PENDING 订阅不能取消：Waffo 在激活前能否取消未实测。Billing 页这时显示 Active，但不显示取消按钮；activated 通常在付款后约 2 秒到达）
CANCELING → 直接返回，不再调用 Waffo
↓
PaymentProvider.cancelSubscription()（Waffo：client.orders.cancelSubscription）
  ACTIVE → canceling，周期结束时 canceled
  PAST_DUE → canceling，立即结束
失败 → 记录 billing.cancel_failed（error），返回 PAYMENT_ERROR，状态不变
↓
按 Waffo 返回值写入状态，status_updated_at = now()（之前发生、之后才到达的事件不会改回）
  条件：状态仍是调用前读到的状态。等待 Waffo 期间 webhook 已改了状态（例如 CANCELED）时不覆盖，返回数据库中的当前状态
```

之后的 `subscription.canceling` / `subscription.canceled` webhook 按 [Subscription Webhooks](#subscription-webhooks) 的时间规则处理。站内不提供恢复：商户 API 不能把 canceling 改回 active，用户可以在 Waffo Customer Portal 中恢复（会收到 `subscription.uncanceled`），或到期后重新订阅。

### Subscription Refund

订阅付款的 `refund.succeeded` 带 Checkout 时写入的 `orderMetadata.subscriptionId` 和被退款的 `paymentId`（Spike 实测），normalize 为 `subscription.payment_refunded`：

```text
找到订阅（不存在 → billing.unknown_subscription，返回 200）
↓
BillingService 读取该 paymentId 的 SUBSCRIPTION_GRANT（CreditService.findEntry）：
  不存在或不属于该订阅 → 失败 → 500，Waffo 重试
↓
target = 退款金额 ≥ 付款金额（或未提供）? 该期发放的 Credits
                                     : ⌈该期发放的 Credits × 退款金额 ÷ 付款金额⌉
（付款金额取 Waffo originalChargedAmount，缺失时取订阅价格快照，与 Purchase Refund 相同）
↓
CreditService.reverse()：
  reversal = min(target, 余额)，> 0 时写 SUBSCRIPTION_REVERSAL，幂等键 subscription-payment:{paymentId}:reversal
↓
reversal < target → billing.refund_shortfall（error，字段 subscriptionId、shortfall）
```

退款不改变订阅状态，也不取消订阅：Waffo 不因退款取消订阅（实测），要「退款并取消」时另外取消。
