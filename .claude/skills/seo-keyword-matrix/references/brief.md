# Content Brief

路径：`seo/briefs/{cluster-id}.md`。例子：`seo/briefs/how-credits-work.md`。

## 模板

```markdown
# Brief: {cluster-id}

- Primary keyword: …
- Related keywords: …
- Intent: {intent} — 搜索者要什么（一句话）
- Page: {path} ({page type})
- Conversion: 正文链接到哪个页面

## Reader question

这个页面回答的一个问题。

## Outline

1. H2 章节，按搜索者需要的顺序排列

## Facts to use

- 每条事实写来源：文档锚点、代码路径，或官方文档链接 + 核对日期

## Not in this page

- 属于其他 Cluster 的内容，写明由哪个 URL 承接

## Internal links

- Body link: …
- Keep reading: …
```

## 内容质量

- 页面要有搜索结果中其他页面没有的东西：本产品的真实数据、真实操作步骤、真实限制。只重写别人的内容，不建页。
- 只写产品真实支持的功能。Brief 中的每个产品事实都要有来源。
- 第三方平台的规则只写官方文档里的事实，并记下链接和核对日期。
- 没有核实的事实只放在 Facts to use 中，标为「待核实」。Outline 的标题和要点不写这些事实：写文章的人照着 Outline 写，标题里的说法会直接进入正文。
- Blog 文章的写法见 [Blog Pages](../../../../docs/product/ux.md#blog-pages)：正文最多一个链接，指向转化页面。

## 验收

Brief 写完后检查：

- [ ] Reader question 是一个问题，和 Cluster 的意图一致
- [ ] Outline 的每一节都服务这个问题，不包含 Not in this page 中的内容
- [ ] Facts to use 每条都有来源
- [ ] Conversion 和 Internal links 指向已存在的页面
- [ ] `pnpm seo:validate` 通过
