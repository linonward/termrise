# @repo/config

服务端 env 校验和产品 Manifest 类型。

| 子路径                 | 内容                                                                          |
| ---------------------- | ----------------------------------------------------------------------------- |
| `@repo/config/env`     | `serverEnv()`：用 zod 校验 `process.env`，缺少变量时抛 `EnvError`             |
| `@repo/config/product` | `ProductManifest` 类型与 `defineProduct()`（根目录 `product.config.ts` 使用） |

`@repo/config/env` 是“包不读取 env”规则的例外，只由应用调用。变量说明见 [environment.md](../../docs/architecture/environment.md)。

包的规则（子路径导入、不读取 env、不依赖 `apps/*`）见 [Monorepo](../../docs/architecture/overview.md#monorepo)。
