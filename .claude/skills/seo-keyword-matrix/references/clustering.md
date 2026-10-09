# Clustering

## 规则

1. 一个 Cluster = 一个搜索意图 = 一个 URL。
2. 判断两个词是否属于同一 Cluster：两个词的 Google 前 10 个结果有 3 个以上相同的 URL，就放在一起。有 SERP 导出时用 `scripts/cluster.mjs` 计算：搜索量最大的词作为主词，只和主词比较，避免 A 像 B、B 像 C 时把 A 和 C 连在一起。脚本的结果是建议，规则 3–4 和意图判断仍由 Agent 检查。没有 SERP 数据时，手动搜索比较，并在 `note` 中写「未查 SERP」。
3. 只是词序、单复数、修饰词（free、online、best、2026）不同的词，放在同一个 Cluster。
4. 意图不同的词分开，即使用词相近：`ai video generator`（交易型）和 `how to make ai videos`（信息型）是两个 Cluster。
5. 主关键词（`primary`）选 Cluster 中意图最明确、搜索量最高的词。
6. 每个关键词只属于一个 Cluster。不要的词放进 rejected Cluster，不删除，避免下次重复判断。
7. `id` 用主关键词的简写（小写、连字符），Blog 页面的 slug 与 `id` 相同。

## 意图与页面类型

| 意图                  | 搜索者要什么             | 页面类型（`PAGE_TYPES`）            |
| --------------------- | ------------------------ | ----------------------------------- |
| informational 信息型  | 学会一件事、弄懂一个问题 | `blog`                              |
| commercial 商业调研型 | 比较、挑选               | `blog`（榜单、选购指南）、`pricing` |
| transactional 交易型  | 马上使用或购买           | `landing`、`pricing`                |
| navigational 导航型   | 找到本产品               | `landing`                           |

判断意图时，看 SERP 前几名是什么类型的页面：都是教程，就是信息型；都是工具页，就是交易型。SERP 的结果优先于词面。

场景页（`/for/*`）和对比页（`/compare/*`）现在没有。需要时按 SKILL.md 第 5 步停下来问维护者。
