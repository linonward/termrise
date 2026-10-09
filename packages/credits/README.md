# @repo/credits

CreditService：余额与 Ledger。余额只经它修改。

| 子路径                          | 内容                                                                                                                                                                                                       |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@repo/credits/credit-service`  | `createCreditService()`：余额（`getBalance`）；账本原语 `grant` / `reverse` / `debit` / `refund` / `findEntry`（按 `idempotency_key` 幂等）；注册赠送（`grantSignupBonus`）；`adminAdjust`；`listActivity` |
| `@repo/credits/credit-activity` | Ledger 记录转为页面展示的 DTO                                                                                                                                                                              |

不变量见 [CreditService](../../docs/architecture/data-model.md#creditservice)。手动调整用 `pnpm admin:adjust`，见 [Adjust Credits](../../docs/runbook.md#adjust-credits)。

包的规则（子路径导入、不读取 env、不依赖 `apps/*`）见 [Monorepo](../../docs/architecture/overview.md#monorepo)。
