# Roadmap

## Slice Plan

每个 Slice 对应一个分支和一个 PR。开始 Slice 前，在下表加一行。

| Slice | 内容                                                                                                                                                                    | 验收                                                                                                                                                | 状态   |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| S01   | Starter 只读审计：按 [Termrise 工程实施方案](architecture/termrise.md) 核对 monorepo、DB、Auth、AI、Jobs、Analytics、SEO、Waffo、Credits、Storage、测试与部署的真实实现 | `docs/architecture/starter-audit.md` 列出「已实现 / 部分实现 / 缺失 / 接口与风险」和后续 Slice，并加到 Where to Look 表；不修改代码，不调用付费 API | 已完成 |
| S02   | 回答 S01 的 Doc Conflicts：Worker 与队列方案（ADR-011）、定时采集、Waffo 与 Credits、`DEEPSEEK_BASE_URL`；同步 termrise.md、PRD、jobs.md、deployment.md                 | 决定写入 Confirmed Decisions 与 ADR-011；文档之间没有矛盾；不修改代码                                                                               | 已完成 |

## Confirmed Decisions

- 2026-10-08：从 saas-starter 创建。
- 2026-10-08：仓库改为 pnpm workspace + Turborepo（apps/web + packages），只部署 apps/web；apps/api、apps/worker、packages/ai、packages/jobs 为骨架。见 [ADR-008](adr/008-monorepo.md)。
- 2026-10-08：增加订阅。订阅每期发放 Credits（与 Credit Pack 共用余额和 Ledger），Credits 不过期；一个用户最多一个有效订阅；站内取消、不提供恢复；订阅退款按比例扣回该期 Credits。见 [ADR-009](adr/009-subscription.md)。
- 2026-10-08：未付款的订阅 Checkout 不拦截重试，只拦已付款订阅（ADR-009 修订）。
- 2026-10-08：模型调用使用 Vercel AI SDK（`ai` + `@ai-sdk/*`），只在 `packages/ai` 的适配器中引用，业务层仍只依赖 `AiProvider`。第一个接入的 Provider 是 DeepSeek。
- 2026-10-08：`subscription.activated` 并入 `subscription.status_changed`。
- 2026-10-08：订阅退款用 `orderMetadata.subscriptionId` 区分。
- 2026-10-08：所有产品共用一个 PostHog Project，事件用 `product_id`（`product.config.ts` 的 `id`）区分；不新增环境变量。Vercel Web Analytics 继续启用，用于统计未同意 Cookie 的访客来源。
- 2026-10-08：本地开发默认用 SeaweedFS 代替 R2（`docker compose up -d storage` + `R2_ENDPOINT`），Production 禁止 `R2_ENDPOINT`。不用 MinIO（已停止发布镜像）。见 [ADR-005](adr/005-r2-storage.md) 修订。
- 2026-10-08：CreditService 只提供账本原语，订单规则只在 BillingService 中实现，锁顺序由 BillingService 决定。见 [ADR-010](adr/010-ledger-primitives.md)。
- 2026-10-08：TaskService 是示例业务代码，留在 `apps/web`，不放进 `packages/*`；CreditService 不读取任何业务表的状态。产品启用 Worker 时，再把产品自己的 Service 移到包中。见 [ADR-010](adr/010-ledger-primitives.md) 修订。
- 2026-10-08：不按领域拆分错误码表（`AppError` 的 code 类型来自一张表，拆分需要泛型或模块扩展，代价大于收益）；只把 `CreditError.code` 改为字面量联合类型。env schema 不提前拆分，产品启用 Worker 时为它单独定义（jobs.md）。
- 2026-10-08：`apps/web/src` 保留两种放置方式并写成规则：产品要替换的功能用 `features/<name>/`，平台能力用 `server/<domain>/` + `components/<domain>/`；不把 billing 等移入 `features/`。
- 2026-10-08：SEO 关键词流程沉淀为仓库内的项目 Skill（`.claude/skills/seo-keyword-matrix`，Codex 用 `.agents/skills` 符号链接）。只有 Skill 用的脚本（导入、打分、列出）放在 Skill 的 `scripts/`，用 JS（不经过 typecheck，不需要 tsconfig）；矩阵校验是站点规则，放在 `@repo/seo` 并由 `pnpm test` 运行。聚类、意图判断和 Brief 由 Agent 完成。关键词数据放在仓库 `seo/`。第一版只映射到已有页面类型（Blog、Landing、Pricing），`/for`、`/compare` 另开 Slice。
- 2026-10-10：产品改为 Termrise，见 [product.md](product/product.md)；暂时不对外收费，Waffo 与 Credits 不用于 Termrise 自身。Slice 编号从 S01 重新开始；ADR 中的「saas-starter S{nn}」指模板仓库的 Slice。
- 2026-10-10：Worker 用 BullMQ + Upstash Redis（Fixed 套餐），部署在 Cloudflare Containers；BullMQ 只在 `apps/worker` 中。web 不连接 Redis、不入队，只写数据库状态；Worker 用 Job Scheduler 扫描待处理记录并入队，定时采集也由它触发。见 [ADR-011](adr/011-worker.md)。
- 2026-10-10：Waffo 与 Credits 保留代码、隐藏入口：注册不发 Credits，UI 不显示收费入口。在品牌 Slice 中实施。
- 2026-10-10：不新增 `DEEPSEEK_BASE_URL`，沿用 `DEEPSEEK_API_KEY` + `DEEPSEEK_MODEL`。

## Open Questions

- Production 仍要求 `PAYMENT_PROVIDER=waffo` 和 Waffo Key（Fake 在 Production 被禁止）。部署 Production 前决定：配置 Waffo Key，还是让收费模块可以关闭。

### 暂缓

暂时不对外收费，下面的问题在启用收费时再回答。

- 订阅方案的价格、周期和每期 Credits：现在是占位值，上线前按 Unit Economics 定价。
- Waffo 订阅 `canceling` 到期后变为 `canceled` 尚未实测（test 环境需要 Waffo 支持推进）。实现订阅时用 Fake Provider 覆盖，上线前在 prod 用真实订阅确认。
