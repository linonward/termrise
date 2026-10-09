# @repo/ai

`AiProvider` 接口与适配器。业务层只依赖接口，不直接引用模型 SDK。

| 子路径                       | 内容                                       |
| ---------------------------- | ------------------------------------------ |
| `@repo/ai/provider`          | `AiProvider` 接口                          |
| `@repo/ai/adapters/example`  | 示例适配器：不调用第三方，把输入反转后返回 |
| `@repo/ai/adapters/deepseek` | DeepSeek 适配器（Vercel AI SDK）           |
| `@repo/ai/adapters/fake`     | 测试用适配器                               |

AI SDK 只在 `src/adapters/` 中引用；适配器抛出的错误只保留 HTTP 状态，不带 `cause`（避免记录完整 Prompt）。新产品用自己的适配器替换示例，见 [tasks.md](../../docs/architecture/tasks.md)。

包的规则（子路径导入、不读取 env、不依赖 `apps/*`）见 [Monorepo](../../docs/architecture/overview.md#monorepo)。
