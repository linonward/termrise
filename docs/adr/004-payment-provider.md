# ADR-004: Payment Provider — Waffo Pancake

- Status: Accepted（Sandbox 已验证）；「不做订阅」已被 ADR-009 取代
- Date: 2026-10-05

## Context

按 Credit Pack 一次性收费，不做订阅。需要托管 Checkout、可验签的 webhook 和退款事件。

## Decision

- 只接 Waffo Pancake（Merchant of Record，SDK `@waffo/pancake-ts`），经 `PaymentProvider` 接口调用，业务层不知道 Waffo，见 [PaymentProvider](../architecture/billing.md#paymentprovider)。
- 只有验签通过的 webhook 能发放 Credits；success redirect 只显示提示，见 [Waffo Payment Flow](../architecture/billing.md#waffo-payment-flow)。
- 测试和本地开发使用 FakePaymentProvider（`PAYMENT_PROVIDER=fake`）。

## Alternatives

- **多个支付服务商**：增加对账和维护成本，有明确需要时再考虑。
- **订阅**：按次付费的产品先用一次性 Credit Pack；需要订阅时另写 ADR。

## Consequences

- 选 Pancake（MoR）而不是直连收单：不需要公司主体，税务与合规由 Waffo 承担，代价是费率更高（3.9% + $0.50 vs 2.9% + $0.50）。
- 每个 Credit Pack 是一个 Waffo 商品；创建 Checkout 时只有 Session ID，Order ID 由 webhook 回填；一次性付款没有失败事件。实测细节见 [Payment Provider Spike](../payment-provider-spike.md)。
- 上线前需要通过 KYB；生成 AI 内容的产品还要通过 AIGC 合规审核（模型披露、Prompt 与结果审核、屏蔽词表、审核记录、AUP），影响 Legal 与 Landing 页。starter 没有内容审核，这类产品要在申请前自己加上。
