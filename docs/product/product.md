# Product

本文件是新产品的模板。用 Starter 创建新产品后，先填写每个「（填写：…）」。标为「Starter 默认」的内容已经在代码中实现；要改时同时改代码。

## Mission

（填写：一句话说明这个产品为谁解决什么问题，以及怎样产生收入。）

下面两条流程是产品主线，任何改动都不能让它们中断。

主流程（Starter 默认，`Run Task` 换成产品自己的付费功能）：

```text
Visitor
↓
Landing
↓
Sign Up
↓
Free Credits
↓
Dashboard
↓
Run Task（扣 Credits）
↓
Result
```

商业闭环（Starter 默认）：

```text
Credits Insufficient
↓
Pricing
↓
Waffo Checkout
↓
Payment
↓
Verified Webhook
↓
Credits
↓
Run Task
```

---

## Product Positioning

### 一句话产品

（填写：用户输入什么，得到什么，用在哪里。）

核心：

> （填写：Input → Output）

---

## What We Are NOT Building

新功能不在 [Current Scope](#current-scope) 中时，Agent 停下来问维护者，不主动扩大 Scope。

### 定位决定，不做

（填写：会让产品偏离一句话定位的功能，每条写一行理由。）

Starter 默认不做：

- 订阅期内无限使用、订阅内换方案（plan change）：订阅只按期发放 Credits，换方案先取消再重新订阅。
- Account Settings Page、Password Auth：登录只用 Magic Link 和 Google；删除账号通过支持邮箱处理。
- Team Workspace、Organization：一个账号一个用户。

### 现在不做，满足条件后重新评估

| 功能           | 重新评估的条件 |
| -------------- | -------------- |
| （填写：功能） | （填写：条件） |

---

## Target Users

第一批用户：

- （填写：用户群 1）
- （填写：用户群 2）

典型场景：

```text
（填写：用户现在怎样做这件事，哪一步最痛，为什么愿意付费）
```

---

## Value Proposition

核心价值：

```text
（填写：用户操作的 3–4 步）
```

产品操作目标：

```text
（填写：首次得到结果的时间上限）

（填写：真正需要用户操作的时间上限）
```

AI Provider 的实际处理时间不计算在用户操作时间内。

---

## Current Scope

### Shipped

Starter 已包含：

- 账户：Magic Link、Google（含 One Tap）
- 计费：注册赠送 Credits、Credit 明细、Waffo Checkout、购买记录、失败退款
- 订阅：每月发放 Credits，Billing 页站内取消，PAST_DUE 时链接 Customer Portal
- 示例付费功能：Dashboard 上的 Task（扣 1 Credit，失败退回），用产品自己的功能替换
- 获客页面：Landing、Pricing、Blog、Legal（Terms / Privacy / Refund Policy）、SEO，见 [Pages & UX](ux.md)
- 运营：管理台、Analytics（同意后才启用）、Error Monitoring、Rate Limiting
- i18n：English / 简体中文

（填写：产品自己的已上线功能。）

### Backlog

按价值排序：

- （填写）

---

## Business Model

使用：

> Credit Packs + Subscription

规则（Starter 默认）：

- Credit Pack 一次性购买，不自动续费。
- Subscription（见 ADR-009）：自动续费，每次扣款成功发放该方案的 Credits；一个用户最多一个有效订阅；取消后当期结束时停止续费。
- Credits 永不过期，订阅发放的 Credits 取消订阅后仍可使用。
- 失败的任务自动退回 Credits。
- 价格统一用美元（USD）显示。

---

### Free

注册赠送（Starter 默认）：

```text
10 Credits
```

目标：

（填写：让新用户至少完成几次核心操作。赠送数量改动时，同时改 `product.config.ts` 的 `signupBonusCredits` 和 `apps/web/messages/*.json` 中所有写着 10 Credits 的文案。）

---

### Paid

价格只在 `CREDIT_PACKS`（`packages/billing/src/credit-packs.ts`）和 `SUBSCRIPTION_PLANS`（`packages/billing/src/subscription-plans.ts`）中定义。Starter 中的价格是占位值，上线前必须按下方 [Unit Economics](#unit-economics) 重新定价：

| Pack    | 价格   | Credits |
| ------- | ------ | ------- |
| Single  | $5.90  | 10      |
| Starter | $19.90 | 50      |
| Creator | $49.90 | 150     |
| Pro     | $79.90 | 280     |

| 订阅方案 | 价格       | Credits |
| -------- | ---------- | ------- |
| Monthly  | $9.90 / 月 | 60 / 月 |

定价原则：

- Single 是单买的参照价。其他 Pack 显示按实际单价比 Single 省多少，向下取整，不夸大折扣。
- 页面上的次数（uses）和每次价格（perUse）由 `pack-pricing.ts` 从 Credits 和每次消耗算出，不手写。
- 改价时代码和 Waffo 商品价格必须一致，操作顺序见 `docs/runbook.md` 的 Change Prices。

（填写：最终价格、每个 Pack 对应的次数，以及定价理由。）

---

### Task Cost

服务端维护唯一真相（Starter 默认）：

```ts
export const TASK_CREDIT_COST = 1;
```

位置：`apps/web/src/features/tasks/credit-cost.ts`。客户端显示的消耗只用于展示，服务端执行任务时必须重新计算。

（填写：产品自己每次操作的 Credits 消耗；按参数不同时写成表。）

---

## Unit Economics

上线前必须完成，不得等上线后再计算成本。

核心约束：

```text
selling_price
---------------- >= 2.5
provider_cost
```

目标：

```text
Gross Margin >= 60%
```

必须计算：

```text
Provider Cost / Task

Credits / Task

Revenue / Credit

Revenue / Task

Gross Profit / Task

Gross Margin
```

必须按 **最便宜的单次价格**（最大的 Pack）计算最坏情况：

| Pack     | Revenue / Task |
| -------- | -------------- |
| （填写） | （填写）       |

由此得到每次任务的 Provider 成本上限（满足 2.5x）：（填写）。实测成本：（填写）。

另外必须记录：

```text
Signup Bonus 成本（每个注册用户的免费额度）

Waffo 手续费（以官方费率为准）
```

毛利计算需扣除支付手续费。

订阅方案使用同一约束：每期价格 ÷（每期任务次数 × Provider Cost / Task）≥ 2.5。

---

## Core User Journey

Starter 默认（示例 Task）：

```text
Landing
   ↓
Sign Up
   ↓
10 Free Credits
   ↓
Dashboard
   ↓
Enter Input
   ↓
Run
   ↓
Debit Credits
   ↓
PENDING
   ↓
Provider
   ↓
SUCCEEDED（显示结果）
```

失败：

```text
Provider Error
      ↓
FAILED
      ↓
Refund Credits
```

同一个 `requestId` 重复提交返回已有的任务，不重复扣费。再次运行是新的任务，重新扣费；不重新激活旧任务。

（填写：产品自己的用户旅程，替换上面的示例。）
