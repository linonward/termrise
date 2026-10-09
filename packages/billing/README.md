# @repo/billing

Credit Pack 与订阅的价格、Checkout、支付 Webhook。业务层只依赖 `PaymentProvider`，不直接依赖 Waffo。

| 子路径                             | 内容                                                                                        |
| ---------------------------------- | ------------------------------------------------------------------------------------------- |
| `@repo/billing/billing-service`    | `createBillingService()`：Checkout、Webhook 处理、订阅查询与取消                            |
| `@repo/billing/purchase-flow`      | Credit Pack 的 Checkout、付款与退款事件、购买列表（由 `createBillingService()` 组合）       |
| `@repo/billing/subscription-flow`  | 订阅的 Checkout、付款 / 状态 / 退款事件、当前订阅、取消（由 `createBillingService()` 组合） |
| `@repo/billing/flow`               | 两个 flow 共用的类型、Pending 过期时间、`refundCredits()`                                   |
| `@repo/billing/types`              | `PaymentProvider` 接口、Webhook 事件类型                                                    |
| `@repo/billing/credit-packs`       | `CREDIT_PACKS`：一次性 Credit Pack 的价格与 Credits                                         |
| `@repo/billing/subscription-plans` | `SUBSCRIPTION_PLANS`                                                                        |
| `@repo/billing/pack-pricing`       | 展示用的单价计算                                                                            |
| `@repo/billing/adapters/waffo`     | Waffo 适配器与商品 ID（`WAFFO_PRODUCT_IDS`）                                                |
| `@repo/billing/adapters/fake`      | 测试用适配器与 Webhook 请求                                                                 |

Credits 只经 `@repo/credits` 修改。改价顺序见 [Change Prices](../../docs/runbook.md#change-prices)，设计见 [billing.md](../../docs/architecture/billing.md)。

包的规则（子路径导入、不读取 env、不依赖 `apps/*`）见 [Monorepo](../../docs/architecture/overview.md#monorepo)。
