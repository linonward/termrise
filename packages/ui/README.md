# @repo/ui

设计 token 和基础 UI 组件（shadcn/ui，基于 Radix）。

| 子路径                       | 内容                                                                    |
| ---------------------------- | ----------------------------------------------------------------------- |
| `@repo/ui/styles/theme.css`  | 颜色、字号、间距等 token                                                |
| `@repo/ui/components/<name>` | `button`、`dropdown-menu`、`popover`、`sheet`、`toggle`、`toggle-group` |
| `@repo/ui/utils`             | `cn()`                                                                  |

UI 只用这里的 token 和组件，见 [design-system.md](../../docs/design/design-system.md)。

包的规则（子路径导入、不读取 env、不依赖 `apps/*`）见 [Monorepo](../../docs/architecture/overview.md#monorepo)。
