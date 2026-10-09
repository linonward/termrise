# @repo/seo

sitemap、JSON-LD 结构化数据、IndexNow 和关键词矩阵的纯函数。

| 子路径                      | 内容                                                                                      |
| --------------------------- | ----------------------------------------------------------------------------------------- |
| `@repo/seo/sitemap`         | `buildSitemap()`                                                                          |
| `@repo/seo/structured-data` | `siteGraph()`、`jsonLdHtml()`                                                             |
| `@repo/seo/indexnow`        | IndexNow 请求体，供 `pnpm indexnow` 使用                                                  |
| `@repo/seo/keyword-matrix`  | 矩阵 schema、`PAGE_TYPES`、`validateMatrix()`，供 `pnpm seo:validate` 和 `pnpm test` 使用 |

见 [SEO](../../docs/product/ux.md#seo) 和 [Keyword Matrix](../../docs/product/ux.md#keyword-matrix)。

包的规则（子路径导入、不读取 env、不依赖 `apps/*`）见 [Monorepo](../../docs/architecture/overview.md#monorepo)。
