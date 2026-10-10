# Termrise — 工程实施方案（Codex）v2.1

日期：2026-10-10。

## 首要执行规则

当前工程是已有的 `saas-starter`。**第一步只读审计，不直接重构或开始大规模编码。** 检查 monorepo、Next.js、DB/Drizzle、Better Auth、AI Provider、BullMQ/Redis、Analytics、SEO、Waffo、Credits、Storage、测试、CI、部署和现有约束。输出“已实现 / 部分实现 / 缺失 / 接口与风险”对照表，再确认实施计划。禁止重新搭建通用 Starter。

采用 MVP-first、TDD-first、按垂直功能独立提交。每个任务先测试再实现；不得在默认 CI 调用付费 API。

## 技术架构

Next.js 16 + TypeScript（沿用现有版本与约定）、PostgreSQL + Drizzle、Zod、Vitest + Playwright。`apps/web`（Vercel）只做展示，经 HTTP 调用 `apps/api`；`apps/api`（Hono，Cloudflare Workers）实现全部 API；**常驻 Worker** 处理定时采集、批量扩词、SERP、AI 分析。Starter 没有 BullMQ/Redis（S01 审计结果见 `docs/architecture/starter-audit.md`）。Worker 用 BullMQ + Upstash Redis，部署在 Cloudflare Containers；API 只写数据库状态，不入队，由 Worker 扫描并调度。决策见 `docs/adr/011-worker.md`。

业务模块（逻辑分层，实际目录依模板调整）：

```text
apps/web                  # UI only (Vercel), calls apps/api over HTTP
apps/api                  # all HTTP APIs (Hono on Cloudflare Workers)
apps/worker               # BullMQ worker on Cloudflare Containers
packages/trend-discovery  # trends / HN / normalized signals
packages/keyword-intel    # DataForSEO / metrics / SERP
packages/opportunity      # clustering / scoring / evidence
packages/product-brief    # structured AI analysis / markdown export
packages/execution        # validation / launch / revenue events
```

不得为目录整齐而强制拆包；尽量让业务域不污染通用 Starter 基础包。

## 外部 API

DataForSEO Base URL：`https://api.dataforseo.com/v3/`。编码前核对 https://docs.dataforseo.com/v3/ 的最新请求结构、单次上限、分页、费率、返回状态与 `cost`。

| 业务             | API 路径                                              |
| ---------------- | ----------------------------------------------------- |
| Google Ads 扩词  | `keywords_data/google_ads/keywords_for_keywords/live` |
| 长尾建议         | `dataforseo_labs/google/keyword_suggestions/live`     |
| 相关词           | `dataforseo_labs/google/related_keywords/live`        |
| 搜索量/CPC       | `keywords_data/google_ads/search_volume/live`         |
| 批量 KD          | `dataforseo_labs/google/bulk_keyword_difficulty/live` |
| SERP             | `serp/google/organic/live/advanced`                   |
| 竞品排名词（P1） | `dataforseo_labs/google/ranked_keywords/live`         |

默认 `location_code=2840`、`language_code=en`。Google Ads competition 与 SEO KD 不混用。优先复用扩词结果的有效指标。

趋势：Google Trends Trending Now 仅使用当前合法、稳定的 RSS/CSV 等导出方式；不稳定则禁用并提供 CSV 导入。HN 使用 https://github.com/HackerNews/API ，保留故事 ID、标题、URL、时间、分数、评论等。讨论热度不能冒充搜索量。

DeepSeek：使用 Starter 的 AI Adapter 或 OpenAI-compatible provider；**实际模型 ID 和 JSON 模式参数必须在编码时对照官方文档确认**，不要写死未经验证的模型名称。AI 返回必须经过 Zod 校验。所有数据源内容视为不可信，防 prompt injection。

## 环境变量（拟新增，先审计避免重复）

```dotenv
DATAFORSEO_LOGIN=
DATAFORSEO_PASSWORD=
DEEPSEEK_API_KEY=
DEEPSEEK_BASE_URL=https://api.deepseek.com
RESEARCH_DEFAULT_LOCATION_CODE=2840
RESEARCH_DEFAULT_LANGUAGE_CODE=en
RESEARCH_MAX_DATA_COST_USD=20
RESEARCH_MAX_AI_COST_USD=5
RESEARCH_ENABLE_LIVE_API=false
GOOGLE_TRENDS_ENABLED=true
HACKER_NEWS_ENABLED=true
```

`RESEARCH_ENABLE_LIVE_API=false` 时禁止付费数据调用；密钥只在服务端和 Worker 使用，不进前端包、日志和 git。

## 数据库设计（逻辑表，字段随 Starter 约定调整）

- `research_projects`: owner, market, language, seeds, budgets, status。
- `research_runs`: project, stage, status, timestamps, error, idempotency key。
- `source_signals`: provider, external_id, URL, raw title, observed_at, ingested_at, metadata；唯一 `(provider, external_id)`。
- `trend_terms` / `trend_observations`: normalized term, first/last seen, source, unit, time window, value。
- `keywords` / `keyword_expansions`: normalized phrase, market/language, seed relationship, provider task。
- `keyword_metric_snapshots`: volume, CPC, ads competition, KD, monthly history, provider, fetched_at；缺失用 null。
- `serp_snapshots` / `serp_results`: keyword, market, device, timestamp, rank, URL, title, type。
- `keyword_clusters` / `cluster_memberships`: product vs landing-page intent cluster。
- `opportunities` / `opportunity_evaluations`: hypothesis, score, scoring version, confidence, evidence refs。
- `evidence_sources` / `decisions` / `validation_experiments`: verifiable claims and human decisions。
- `product_blueprints` / `execution_projects` / `execution_events` / `revenue_events`: export, launch, acquisition, paid outcomes。
- `api_tasks` / `api_usage` / `budget_reservations` / `ai_runs`: idempotency, costs, prompts, model versions, retries。

Indexes on project, run, normalized keyword+market+language, provider external ID, observation time and opportunity status. Metric snapshots append-only; scores and decisions versioned. Revenue events include currency, gross, refund, known fees, source type and evidence ID; no card data.

## 业务 API（示意；沿用 Starter 路由习惯）

```text
POST   /api/research/projects
GET    /api/research/projects
POST   /api/research/:id/seeds/import
POST   /api/research/:id/run
GET    /api/research/:id/runs/:runId
POST   /api/research/:id/runs/:runId/cancel
GET    /api/radar/terms
GET    /api/radar/terms/:id
GET    /api/research/:id/keywords
GET    /api/opportunities
GET    /api/opportunities/:id
POST   /api/opportunities/:id/decision
POST   /api/opportunities/:id/experiments
POST   /api/opportunities/:id/blueprint
GET    /api/opportunities/:id/blueprint.md
POST   /api/execution/projects
POST   /api/execution/projects/:id/events
GET    /api/research/:id/costs
```

全部鉴权、授权、Zod 验证、限流；启动异步任务返回 run ID 而非等待长任务完成。状态与错误码稳定，避免泄露 provider 凭据。

## Worker 队列与状态机

队列：`trend.ingest`、`keyword.expand`、`keyword.enrich`、`serp.audit`、`opportunity.analyze`、`blueprint.generate`。每个任务有 `runId`、阶段、attempt、request hash、预算 reservation、checkpoint。指数退避重试，最大次数受限；支持部分成功、取消和断点恢复。

研究：`draft → collecting → expanding → enriching → clustering → auditing → evaluating → completed`；异常 `partial/failed/cancelled/budget_exhausted`。

避免重复计费：先检查已有 DataForSEO task ID / cache；超时不直接重新付费创建任务。预算使用数据库事务原子预留，按 API 实际 cost 结算；保守估算不足则停止派发。缓存键包括 provider、endpoint、market、language、参数哈希、数据版本。

## AI Tasks

1. `extractTrendCandidates`: 从真实标题/讨论提取新概念和用户任务，输出 candidate + source IDs。
2. `classifyIntent`: informational / commercial / transactional / navigational，另标注 tool intent。
3. `reviewClusters`: 规则聚类后，仅对歧义组进行语义复核；分产品机会与页面意图两层。
4. `analyzeOpportunity`: 输入指标、SERP、竞品证据，输出目标用户、痛点、差异化假设、定价和风险。
5. `generateBlueprint`: 输出 Markdown 产品 Brief、MVP 边界、验证实验、任务和验收。

所有 AI 输出 Schema 验证，记录模型、prompt_version、tokens、cost、输入 hash、证据 ID。不得让 AI 直接写数值评分、搜索量、KD、收入，也不得绕开预算控制自主调用付费 API。

## 评分规则

确定性 Opportunity Score：趋势 20、搜索需求 15、竞争 20、商业意图 25、MVP 10、分发 10。Evidence Confidence 独立。没有足够真实数据时标记 needs_review，不得仅凭 AI 文本自动判定 Go。所有评分版本可重算。

## 分阶段开发任务（每项独立提交）

| Task  | 交付                           | 测试/验收                                                       |
| ----- | ------------------------------ | --------------------------------------------------------------- |
| M0-01 | Starter 只读审计和依赖映射     | 审计结果写入 `docs/architecture/starter-audit.md`，确认真实模块 |
| M0-02 | PRD 与实施计划差距/风险评审    | 无未解释的重大依赖                                              |
| M1-01 | Research Project CRUD + Schema | 鉴权、迁移、CRUD 测试                                           |
| M1-02 | API Budget Ledger              | 并发预留、超额拒绝、结算测试                                    |
| M1-03 | HN Adapter + CSV Import        | fixture、去重、幂等                                             |
| M1-04 | Google Trends Adapter          | 解析、来源、不可用回退                                          |
| M1-05 | Scheduler/Worker + Radar UI    | 任务状态、错误、移动端                                          |
| M2-01 | DataForSEO Client              | mock 鉴权、超时、错误、cost                                     |
| M2-02 | Expansion + Normalization      | 去重、父子词、批处理                                            |
| M2-03 | Volume/KD + Cache              | null vs 0、补查、缓存                                           |
| M2-04 | SERP Audit                     | Top 10、证据时间与来源                                          |
| M3-01 | AI Intent/Cluster              | Zod、证据引用、无幻觉数值                                       |
| M3-02 | Opportunity Scoring            | 固定 fixture 可复现、版本化                                     |
| M3-03 | Opportunity UI/Top 5           | 低置信度提示、少于 5 可用                                       |
| M4-01 | Validation Lab + Decisions     | 阈值、历史、No-Go 路径                                          |
| M4-02 | Blueprint Markdown Export      | 生成内容完整、可复制                                            |
| M4-03 | Execution/Revenue Tracker      | 手工与核实数据分离                                              |
| M5-01 | 真实研究与上线实验             | 实际 API 成本、证据、复盘                                       |

任务应按功能垂直切片，包括 schema、service、API、UI、测试；一个任务一份验证记录，必要时使用独立 worktree，提交前测试和构建通过。

## 测试策略

Vitest：规范化、趋势计算、评分、预算、幂等、Zod、Provider Mock；集成测试：PostgreSQL 事务、任务状态、权限、缓存；Playwright：研究创建 → 导入 → 运行（fixture）→ 查看机会 → 决策 → 导出 → 记录结果。CI 禁止真实付费请求。单独 `live-smoke` 手动触发，严格限额并记录 cost。

故障测试：DataForSEO 429/5xx/部分结果、DeepSeek JSON 错误、Trends 不可用、Worker 重启、并发预算争用、任务超时、重复回调、没有 KD、没有搜索量、没有成交证据。

## 部署与监控

Web 沿用现有 Next.js 部署（Vercel）；API 部署在 Cloudflare Workers，经 Hyperdrive 连接数据库（`docs/adr/012-api-modular-monolith.md`）；长任务由 Worker 执行（Cloudflare Containers），数据库复用 Starter，Redis 用 Upstash（`docs/adr/011-worker.md`）。监控队列积压、任务失败、外部服务延迟、费用、模型 tokens、缓存命中率。日志去除凭据与敏感数据。首次上线前做数据库备份和迁移回滚演练。

## 完成定义

可在受控预算内从真实热词采集到真实搜索指标、SERP、证据化机会、人工决策和 Markdown Brief，并关联上线与收入结果；所有外部成本可追溯、测试通过、无虚构市场数据。
