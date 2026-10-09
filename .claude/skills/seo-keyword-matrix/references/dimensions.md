# Seed Keyword Dimensions

种子词从产品事实出发，不从关键词工具出发。每个维度写 3–10 个英文种子词（搜索引擎只抓取 en 版本）。

| 维度     | 问题             | 例子（AI 商品视频工具）                |
| -------- | ---------------- | -------------------------------------- |
| 核心功能 | 产品做什么       | image to video ai                      |
| 用户群体 | 谁在用           | video maker for etsy sellers           |
| 使用场景 | 在什么场景用     | jewelry product video maker            |
| 平台生态 | 和哪个平台一起用 | shopify product video generator        |
| 商业意图 | 选购时怎么搜     | best ai product video generator        |
| 问题需求 | 遇到问题时怎么搜 | how to turn product photos into videos |

## 组合

候选词可以按 `平台 × 功能 × 场景 × 修饰词` 组合，再交给关键词工具验证。

- 组合只用来发现候选词。组合出的词没有搜索量，就不进入 `seo/keywords.csv`。
- 修饰词（free、online、best、for {人群}）通常不改变意图，合并到同一个 Cluster，不单独建页。
- 只组合产品真实支持的平台、功能和场景。

## 来源

| 来源                      | 适合                                         |
| ------------------------- | -------------------------------------------- |
| Google Search Console     | 已上线后：真实曝光的查询词                   |
| Google Keyword Planner    | 搜索量区间                                   |
| Ahrefs / Semrush          | 搜索量、难度、相关词                         |
| Google 搜索建议、相关搜索 | 长尾词、问题词（手动记录，source 写 manual） |
