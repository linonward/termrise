---
name: seo-keyword-matrix
description: Builds and maintains this product's SEO keyword matrix in seo/ — imports keyword tool exports, clusters keywords by shared search results, scores opportunities, maps each cluster to one page, writes content briefs that the Blog / Landing / Pricing copy is written from, and after launch reads Search Console data for cannibalization and striking-distance pages. Use when the maintainer asks 关键词矩阵/关键词研究/选词/聚类/内容规划/写 brief/下一批写什么, or brings a GSC / Ahrefs / Semrush / Keyword Planner / SERP export, or asks 蚕食/哪些页面快上首页/上线后怎么优化. Not for technical SEO of shipped pages (sitemap, canonical, JSON-LD) or for writing the page copy itself.
---

# SEO Keyword Matrix

流程：确认收录 → 导入关键词 → 按 SERP 聚类 → 打分 → 映射页面 → 写 Brief → 校验 → 上线后用 Search Console 数据修正。写页面文案是另一个任务，不在本 Skill 中。

先读 [Keyword Matrix](../../../docs/product/ux.md#keyword-matrix)：数据文件、页面类型和 SEO 规则以那里为准。

## 数据

| 文件                         | 内容                                            | 谁写                 |
| ---------------------------- | ----------------------------------------------- | -------------------- |
| `seo/keywords.csv`           | 全部候选词（已规范化）、搜索量、难度、来源      | `scripts/import.mjs` |
| `seo/matrix.json`            | Cluster：关键词、意图、五项评分、目标页面、状态 | Agent                |
| `seo/briefs/{cluster-id}.md` | 每个 planned / published Cluster 的 Brief       | Agent                |

脚本只做确定性的事。`scripts/` 中是只有本 Skill 用的脚本（JS，在仓库根目录用 `node` 运行）：`import.mjs` 导入和去重，`cluster.mjs` 按 SERP 重叠给出聚类建议，`report.mjs` 计算分数并排序，`gsc-report.mjs` 找出蚕食和排名 8–20 的页面。矩阵校验是站点规则，在 `packages/seo/src/keyword-matrix.ts`，由 `pnpm seo:validate` 和 `pnpm test` 运行。意图判断、聚类和 Brief 由 Agent 按 `references/` 完成，维护者确认。

## 步骤

0. **确认收录**（新项目第一次使用时）。先确认站点能被抓取和收录，再做关键词：
   - 维护者已在 Google Search Console 和 Bing Webmaster Tools 验证域名，并提交 `/sitemap.xml`。
   - 用 Search Console 的 URL Inspection 检查 `/`、`/pricing` 和一篇 Blog 文章：已编入索引，或可以编入索引；渲染后的 HTML 有 title、canonical（指向自己）和 JSON-LD。

   任一项不满足时，停下来告诉维护者，先修复。站点技术 SEO 的审计不在本 Skill 中。

1. **收集种子词**。读 `docs/product/product.md`（定位、Target Users、Current Scope），按 [references/dimensions.md](references/dimensions.md) 列出六个维度的种子词，交给维护者去关键词工具中扩展。
2. **导入导出文件**。维护者提供工具导出的 CSV / TSV。先看表头，再导入：

   ```bash
   node .claude/skills/seo-keyword-matrix/scripts/import.mjs <file> --source <tool> --keyword "<列名>" [--volume "<列名>"] [--difficulty "<列名>"]
   ```

   不猜列名，不调用工具的 API。文件不是 UTF-8 时，请维护者重新导出或转换编码。

3. **聚类**。维护者提供 SERP 导出（每个关键词的 Google 前 10 个 URL，例如 Ahrefs / Semrush 的 SERP overview）时，先让脚本给出建议：

   ```bash
   node .claude/skills/seo-keyword-matrix/scripts/cluster.mjs <file> --keyword "<列名>" --url "<列名>" [--position "<列名>"] [--min 3]
   ```

   再按 [references/clustering.md](references/clustering.md) 检查建议、决定分组，每个 Cluster 一个搜索意图、一个主关键词。没有搜索需求、Scope 外、产品无法承接的词，放进 `status: "rejected"` 的 Cluster，在 `note` 中写理由。

4. **打分**。按 [references/scoring.md](references/scoring.md) 给五项打 1–5 分，每个分数要有依据（工具数据、SERP 观察或产品事实）。运行 `node .claude/skills/seo-keyword-matrix/scripts/report.mjs` 查看排序。
5. **映射页面**。每个 Cluster 指定一个页面类型和 URL（`page.type`、`page.path`），类型只能用 `packages/seo/src/keyword-matrix.ts` 的 `PAGE_TYPES`。一个 URL 只承接一个 Cluster。需要新的页面类型（例如 `/compare/*`）时，`status` 保持 `candidate` 并在 `note` 中写明，停下来问维护者：新页面类型是 Scope 扩大。
6. **写 Brief**。维护者选定的 Cluster 按 [references/brief.md](references/brief.md) 写 `seo/briefs/{id}.md`，`status` 改为 `planned`。
7. **校验**。运行 `pnpm seo:validate`，修复全部错误。`pnpm test` 也运行同一个校验。
8. **页面上线后**，`status` 改为 `published`。
9. **上线 4 周后，每月一次**：读 Search Console 的「查询 × 页面」数据。Search Console 网页只能分别导出查询和页面；这份数据要从 Search Analytics API（dimensions 为 `query` 和 `page`）、Looker Studio 或 BigQuery 导出，由维护者提供。

   ```bash
   node .claude/skills/seo-keyword-matrix/scripts/gsc-report.mjs <file> --query "<列名>" --page "<列名>" --clicks "<列名>" --impressions "<列名>" --position "<列名>" [--min-impressions 10]
   ```

   - **Cannibalization**（一个查询有多个本站页面）：查询属于哪个 Cluster，就只保留那个 Cluster 的页面承接它。其他页面改写对应章节，或改为链接到该页面。改动写进 Brief，由维护者确认。
   - **Striking distance**（平均排名 8–20）：先改这些页面。按查询词调整 title、description，或补一个回答该查询的章节，写进 Brief 的 Outline。
   - 新出现的查询词用 `import.mjs --source gsc` 导入，再聚类。按曝光和点击修正 `demand`、`competition` 分数。

## 停下来问维护者

- 第一批选哪些 Cluster：给出 `report` 排序，列出所有带 `*` 的 Cluster（三项都不低于 4 分）。不推荐其中某个时写明理由，例如两页会争同一批读者。维护者看到全部候选才能做选择，所以不要只列推荐的几个。
- 需要新的页面类型，或要改已有页面的定位。
- 一个关键词同时适合两个 Cluster，SERP 也无法区分。
- 处理 Cannibalization 需要合并、删除页面或改 canonical。
- Brief 需要的产品事实在文档和代码中找不到。

## 不做

- 不为凑数量建页面：同一意图换标题、换城市、换平台名生成的页面都不建。
- 不用 LLM 批量生成正文。
- 不写竞品的价格、功能等事实，除非有官方来源并记下链接和核对日期。
- 不改 `seo/` 以外的文件（页面文案由后续任务按 Brief 写）。
