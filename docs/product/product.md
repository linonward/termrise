# Termrise — 产品需求文档 PRD v2.1

日期：2026-10-10。定位：面向独立开发者的英文热词发现、产品机会验证、MVP 启动及首单复盘系统。基于已有 `saas-starter` 开发，不重建基础设施。工程实施方案见 [termrise.md](../architecture/termrise.md)。

## 愿景与目标

**Discover → Verify → Decide → Validate → Build → Launch → Revenue → Learn**。

用户真正要解决的是：正在增长的需求有哪些、能否做成有竞争力的工具、怎样在 7–14 天内实验、如何获得首批用户与付费。不是另一个 Ahrefs 或热搜聚合站；不保证 SEO 排名或成交。

北极星指标：**Revenue-Validated Opportunities**，即系统发现的机会中，实际完成产品发布且产生可核实付费订单的数量。

## 用户与原则

首要用户：缺少英文市场分发渠道、会用 AI Coding 的独立开发者。次要用户：一人公司、小型 SaaS 团队。

- 真实数据优先；AI 推断、事实、待验证假设分别展示。
- Google Trends 相对指数不等于月搜索量；HN 讨论热度不等于 Google 搜索需求。
- 不强制访谈 5 人；公开证据、落地页实验、工具使用、真实付款逐级验证。
- 高评分不等于成功概率；人工 Go / Validate / No-Go。
- 每个付费 API 请求必须经过预算预留、结算与审计。

## MVP 业务范围

P0：研究项目；Google Trends Trending Now（合法可用的导出接口）和 Hacker News 采集；CSV 导入；热词归一化、去重、首次发现和历史快照；DataForSEO 扩词、搜索量、CPC、KD、SERP Top 10；AI 意图分类和机会聚类；证据化机会评分；无访谈验证实验；Product Brief Markdown 导出；产品开发、上线、收入手工记录；预算、缓存、重试和任务状态。

P1：Reddit、GitHub、Product Hunt（授权后）、Google Search Console、PostHog/Waffo 业务数据自动同步、竞品变化监控和提醒。

P2：团队、对外订阅、Credits、自动 GitHub PR/部署。

### What We Are NOT Building

新功能不在上面的 P0 中时，Agent 停下来问维护者，不主动扩大 Scope。

不做：未经授权抓取、自动购买、虚构访谈、编造搜索量、自动生成大量 SEO 垃圾页、承诺收入。

## 页面与功能

| 页面                  | 关键内容                                 | 关键操作                      |
| --------------------- | ---------------------------------------- | ----------------------------- |
| `/radar`              | 新词流、来源、趋势、首次发现、分类       | 筛选、收藏、启动研究          |
| `/radar/[id]`         | 词详情、来源链接、时间曲线、相关词       | 深度验证                      |
| `/research`           | 项目、种子词、任务、API 预算、关键词指标 | 创建、导入、启动、暂停、重试  |
| `/opportunities`      | 机会集群、评分、证据置信度               | 排序、比较、收藏              |
| `/opportunities/[id]` | 目标用户、SERP、竞品、假设、实验         | Go/Validate/No-Go、导出 Brief |
| `/projects/[id]`      | 产品状态、域名、开发、获客、成交         | 记录事件、复盘                |
| `/settings/providers` | 服务状态、调用费用                       | 测试连接、设置预算            |

必须支持移动端、空状态、加载中、部分失败、权限错误和任务重试反馈。

## 用户故事与验收

### F01 热词发现

系统每日采集可用来源，保留 provider、source_id/url、observed_at、fetched_at、原文、规范化词。重复信号不重复建词。`first_seen` 默认指系统首次观测，不假装是互联网首次出现。缺失趋势指标显示“暂无数据”。

### F02 趋势生命周期

支持 emerging、breakout、sustained、seasonal、recurring、insufficient_data。必须有足够且可比较的历史快照才计算增长率；不同时间窗口与地区不可直接比较。

### F03 关键词研究

默认美国英语（location_code=2840、language_code=en）。输入种子词后可批量扩展、规范化、去重、保存来源；搜索量、CPC、Google Ads 竞争、KD 各自独立存储；null 与 0 区分。优先复用扩词响应已有指标，只补查缺失或过期 KD。

### F04 SERP 竞争

记录前十自然结果、设备、地区、排名、标题、URL、时间和类型。AI 分析竞品缺口必须引用证据；不能因域名不熟悉就断言是弱站。

### F05 产品机会

区分“产品机会集群”和“SEO 页面意图集群”。每个机会包含目标用户、任务、替代品、差异化假设、收费假设、分发渠道、MVP 范围、风险和证据。输出最多 Top 5；证据不足时允许少于 5 个。

### F06 无访谈验证

为不同产品生成最小实验：公开用户评论分析、免费小工具、Landing Page Smoke Test、样例+付费升级、透明付费试点。每项实验写清假设、渠道、事件、预算、期限、成功阈值与停止条件。点击和候补名单不等于成交。

### F07 决策与导出

支持 Go / Validate / No-Go，保留决策人、时间、理由和证据版本。导出 Codex 可执行 Markdown：用户、问题、竞品、MVP 功能、排除项、页面、API、数据、验收、测试、获客和定价实验。

### F08 成交反馈

记录仓库、域名、发布日期、访客、激活、订单、退款、毛收入和可计算净收入。每条数据标注 manual / imported / payment_verified。手工填写的订单不能称为支付平台已核实；未知成本不得默认 0。

## 评分与状态

Opportunity Score（100 分）：趋势持续性 20、搜索需求 15、竞争机会 20、商业意图 25、MVP 可行性 10、分发匹配 10。各维度 0–5 分，规则版本化；分数是排序启发式而非成功概率。

Evidence Confidence 独立计算：数据完整性、来源可靠性、时效性、SERP 审计和竞品证据。高分低置信度必须标记 `needs_review`。初筛建议搜索量≥100/月、KD≤25，但对早期新词和高价值低量 B2B 允许记录例外。不可简单相加近义词搜索量。

研究状态：`draft → collecting → expanding → enriching → clustering → auditing → evaluating → completed`；异常 `partial/failed/cancelled/budget_exhausted`。

机会决策：`unreviewed → needs_validation → go/no_go`，历史追加不可覆盖。

产品状态：`not_started → validating → building → launched → measuring → archived`。

## AI 责任边界

DeepSeek 负责新概念/任务提取、意图分类、模糊聚类复核、SERP 缺口假设、产品 Brief。结构化输出需 Zod 校验、保存 prompt/model 版本和 evidence IDs。AI 不负责搜索量、KD、趋势指数、真实订单、预算结算；外部内容视为不可信输入。

## 外部服务与预算

P0：Google Trends 可用公开导出、Hacker News API、DataForSEO、DeepSeek API；复用 Starter 的 PostgreSQL、Auth、Jobs/Redis、AI、Analytics、SEO 等实际存在的模块。Waffo/Credits 暂不用于 Termrise 自身对外收费。

首次研究实验预算建议 DataForSEO ≤$20、AI ≤$5（不等于服务商报价或最低充值）。派发前原子预留、完成后实际费用结算、缓存、熔断、幂等重试。

## 质量与里程碑

M0：审计 Starter；M1：热词采集与成本/任务基础；M2：关键词、KD、SERP；M3：AI 机会分析；M4：验证、Brief、执行与收入；M5：真实产品实验。

测试：Vitest 单元/集成、Playwright E2E、CI 使用 mock 数据；真实付费 API 测试需显式启用。密钥仅服务端保存；符合来源授权；有可观测性和故障恢复。

**最终验收：** 用户可用真实热词发起研究，验证需求与竞争，审查证据，做决策，导出开发 Brief，记录产品上线和真实结果，且系统不编造任何市场或收入指标。
