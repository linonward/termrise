# Pages & UX

本文件写 Starter 中已有的页面和交互规则。新产品增加页面时，在这里加一个小节。

## Pages

```text
/

/pricing

/blog

/blog/:slug

/terms

/privacy

/refund-policy

/sign-in

/sign-up

/dashboard

/radar

/radar/:id

/research

/research/:id

/opportunities

/opportunities/compare

/opportunities/:id

/projects

/projects/:id

/settings/providers

/billing
```

没有 Account 页面。内部管理台为 `/admin`、`/admin/users/:id`，见 [Admin](#admin)。

`product.config.ts` 的 `billingEnabled` 为 `false` 时（Termrise 暂不收费），`/pricing`、`/billing`、`/refund-policy` 返回 404，不出现在导航、页脚、sitemap 和 Landing 中，导航栏没有 Credits，结构化数据不含价格。收费代码与 API 保留，改为 `true` 即恢复。

`/dashboard`、`/radar`、`/research`、`/opportunities`、`/projects`、`/settings` 和 `/billing` 下的页面需要登录：未登录或 session 无效时跳转到 `/sign-in?next=<原路径>`，登录后回到原页面（见 security.md 的 Session Checks）。

---

## Internationalization

支持：

```text
en（默认）

zh（简体中文）
```

规则：

```text
URL 不带 locale 前缀

Locale 来源优先级：
  NEXT_LOCALE cookie
  → Accept-Language
  → en

已登录：用户菜单切换；未登录页面：Footer 切换
```

必须翻译：

```text
所有页面 UI 文案

Landing / Pricing / FAQ

Legal Pages

Blog 文章

Error Code 对应的用户提示

Magic Link 邮件
```

不翻译：

```text
API Error Response 中的 message（保持英文）

用户的输入

日志
```

前端根据 `error.code` 显示本地化文案，不直接展示 API `message`。

错误提示规则：

```text
messages 的 errors.* 为每个 Error Code 提供提示，外加 NETWORK_ERROR（请求没有响应）
↓
未知 code 或非 JSON 响应（如代理返回的 500）→ 按 INTERNAL_ERROR 显示
↓
页面有更贴切的说法时优先使用（如余额不足时加 Buy credits 链接），其余用 errors.*
↓
页面渲染出错 → 兜底页（见 404 & Error Pages）
```

所有文案必须来自 `apps/web/messages/*.json`，组件中不得硬编码用户可见字符串。品牌名来自 `meta.title`。`apps/api` 自己发送的文案（登录邮件）在 `apps/api/messages/*.json`，`apps/api/src/messages.test.ts` 检查两种语言的 key 一致。

测试（`apps/web/src/i18n/messages.test.ts`）检查 `en.json` 与 `zh.json` 的 key 集合一致。

浏览器只收到客户端组件用到的命名空间：根 layout 把 `CLIENT_NAMESPACES`（`apps/web/src/i18n/client-messages.ts`）传给 `NextIntlClientProvider`。Server Component 用 `getTranslations()`，不受限制。客户端组件用一个新的命名空间时，把它加到 `CLIENT_NAMESPACES`；`client-messages.test.ts` 在漏加时失败。客户端组件只用 `useTranslations("namespace")` 读取文案。

价格统一显示美元（USD）。

---

## Theming

```text
System（默认，跟随系统）/ Light / Dark

偏好存在浏览器本地，不需要登录

已登录：用户菜单切换；未登录页面：Footer 切换
```

颜色取值和实现方式见 [Theming](../design/design-system.md#theming)。

---

## Marketing Navigation

公开页面（Landing、Pricing、Blog、Legal）共用顶部导航 `MarketingNav`：

```text
Logo + 品牌名 · Pricing（/pricing，只在 billingEnabled 时）· Blog（/blog）· 右侧操作
```

- 链接只在桌面端显示；移动端只有 Logo 和右侧操作。
- 当前页高亮：Pricing 页高亮 Pricing，Blog 列表和文章页高亮 Blog，Landing 不高亮。
- 右侧操作：未登录为 Log in 和 Get started（`/sign-up`，只在桌面端显示）；已登录为 Dashboard 按钮。

页脚 `SiteFooter`（所有公开页面共用）：

```text
Logo + 品牌名 · 版权 · 支持邮箱（mailto）
Blog · Terms · Privacy · Refund Policy（只在 billingEnabled 时）· Cookie settings（只在启用 Analytics 时）· 语言 · 主题
```

支持邮箱来自 `product.config.ts` 的 `supportEmail`。

---

## Landing Page

`apps/web/src/app/(marketing)/page.tsx`，依次包含：

```text
Hero（Eyebrow、标题、说明、CTA、注释 + 右侧示例）
How It Works（3 步：发现上升热词、检查证据、决定与上线）
Features（4 项：真实数据优先、付费请求预算、给 AI 编程工具的简报、中英双语）
Pricing（与 /pricing 共用 PricingPlans，只在 billingEnabled 时）
FAQ（开始、数据来源、不保证排名或收入、价格）
Final CTA
```

- 文案在 messages 的 `landing`，按 [product.md](product.md) 的定位写：抢先体验阶段，不写尚未提供的数字和承诺。Hero 右侧是示例（`landing.demo`：上升热词 → 产品机会），研究功能上线后换成截图。
- CTA 进入 `/sign-up`。
- 未登录时加载 Google One Tap，等用户第一次交互后才显示。
- FAQ 的退款回答链接到 `/refund-policy`。
- 页面上报 `landing_viewed`。

Landing 重点讲用户得到什么结果，不重点讲模型、GPU、API、架构。

---

## Pricing Page

`/pricing`：标题区 + `PricingPlans` + 说明（USD、Pack 一次性付款、订阅每月续费、付款确认后到账）。

`PricingPlans`（`/pricing` 与 Landing 共用）：

```text
每个 Pack 一张卡片：名称、价格 + one-time、次数、Credits、每次价格 + Save 标签、Credits never expire、购买按钮
推荐 Pack（creator）：加粗描边 + Most popular 标签
Pack 下方每个订阅方案一张横向卡片：名称 + Subscription 标签、每期价格 + per month、每期 Credits、次数、每次价格 + Save、Credits never expire、订阅按钮
下方说明栏：每次消耗、失败退款、新账号赠送
```

- 价格、次数、每次价格和 Save 百分比都从 `CREDIT_PACKS`、`SUBSCRIPTION_PLANS` 和 `CREDIT_COST_PER_USE`（`server/product.ts`）计算（`pack-pricing.ts`），不写死。Single 不显示 Save。
- 购买按钮：未登录进入 `/sign-up?next=/pricing`，已登录发起 Checkout。已有已付款订阅时，订阅按钮下方显示 `SUBSCRIPTION_EXISTS` 文案。
- 页面上报 `pricing_viewed`。

---

## Auth Pages

`/sign-in`、`/sign-up`，共用 `AuthPage`：

```text
桌面端：左侧表单，右侧 surface 展示面板（Hero 标题 + Hero 注释）
移动端：只有表单，Hero 注释放在表单下方
```

- 表单：Continue with Google，或输入 Email 收 Magic Link（5 分钟有效）。上次用 Google 登录时显示 Last used。
- 已登录用户打开这两个页面时，直接跳转到 `next`（默认 `/dashboard`）。
- 链接失效时在标题下方显示错误。
- 页面加载 Google One Tap。
- 两个页面都是 noindex。

---

## Dashboard

`/dashboard`

`billingEnabled` 为 `false` 时（抢先体验）：标题 + 说明 + 「你的研究项目」：最新 5 个项目（名称 → `/research/:id`、状态徽章）和 All projects 链接；没有项目时显示空状态和 [Go to Research]。不显示 Credits 卡片和 TaskPanel。

`billingEnabled` 为 `true` 时：

```text
标题（Welcome back, {name}；没有名字时为 Welcome back）+ 说明

Credits 卡片：余额 · 约可运行次数 · 失败自动退款说明 · [Buy credits] → /billing

TaskPanel（示例付费功能）
```

TaskPanel（`apps/web/src/features/tasks/task-panel.tsx`）是示例，用产品自己的功能替换：

```text
标题 + 说明

Text（textarea，最多 500 字符）

[Run · 1 credit]

结果列表：状态 · 相对时间 · 结果（成功）/ 失败说明（失败）/ 输入（运行中）
```

- 每次提交带新的 `requestId`。提交后刷新页面数据，导航栏和 Credits 卡片的余额来自服务端。
- 余额不足时显示错误和 Buy credits 链接，并上报 `credits_exhausted`。
- 没有记录时显示空状态（No runs yet.）。
- 页面上报 `dashboard_viewed`，提交时上报 `task_started`。

Dashboard 顶栏 `AppNav`：

```text
Logo · Dashboard · Research · Billing · Credits pill（→ /billing）· 用户菜单（Billing 与 Credits pill 只在 billingEnabled 时）
```

用户菜单：

```text
Email

Language

Theme（System / Light / Dark）

Logout
```

移动端：链接、Email、语言、主题和 Logout 收进菜单抽屉。

---

## Radar

`/radar`（无设计稿）：

```text
标题 + 说明
info-soft 提示：HN 的分数和评论是讨论热度，Google Trends 是近似搜索次数的下限，两者都不是月搜索量
搜索框（搜索词）+ 排序（首次发现 / 分数）+ 只看收藏（复选框）+ [Apply]（GET 表单，参数写在 URL 中）
表：故事（→ 详情）、趋势徽章（生命周期）、来源徽章、热度（HN「42 分」，Google Trends「500+ 次搜索」）、评论、首次发现
```

- 没有条目时说明 Worker 每小时采集一次 Hacker News；搜索没有结果时说明换一个词。
- 缺失的分数或评论显示「—」，不显示 0。

`/radar/:id`：

```text
← Radar
标题 + 来源徽章 + 趋势徽章，下方一句话说明这个生命周期的判断依据
Open link（有链接时；Google Trends 为它关联的第一条新闻）、来源链接（HN 为 Discussion，Google Trends 为该市场的 Trending Now 页面），新窗口打开，rel="noopener noreferrer nofollow"
同一条提示
左侧：观测记录表（时间、列表、排名、分数、评论）
右侧：事实（发布时间、首次发现、最近发现、分数、评论；缺失为「暂无数据」）+「研究这个词」面板 [Start research]
```

- Start research 打开 `/research?name=<标题>&seed=<建议的种子词>`，新建项目表单预先填好，用户可以修改后再创建。
- 不存在的条目返回 404 页面。

---

## Research

`/research`（设计稿：`docs/design/exports/research-desktop.png`、`research-mobile-empty.png`）：

```text
标题 + 说明
桌面端：左侧 Projects 表（名称 → 详情、种子词数、状态徽章、创建时间），右侧描边面板 New research project
移动端：Projects 在上，表单在下（无描边面板）
没有项目时：Projects 下显示空状态（No research projects yet）
```

- 地址带 `?seed=`（来自 Radar）时，表单预先填入 `name` 和 `seed`。
- 表单：Name、Seed terms（textarea，每行一个，最多 50 个；提交前在浏览器按 API 的规则规范化）、Market（只读，United States · English）、Data budget / AI budget（美元，默认 20 / 5）、[Create project]。成功后进入详情页。
- 错误按 API 错误码显示在表单下方（`errors.*`）。

`/research/:id`（设计稿：`docs/design/exports/research-project-desktop.png`）：

```text
← Research
项目名 + 状态徽章
市场 · Created 时间
左侧：Seeds and budgets 编辑面板（同一表单，[Save changes]，保存后显示 Changes saved.）
右侧：surface 摘要（种子词数、两项预算）+ 删除（只在 draft 时：两次点击，第二次确认）
```

- 下方是 Signals 表（词、来源、观测日期、链接），右侧是 draft 才有的「从 CSV 导入」：选择文件后在浏览器读取文本并提交，显示导入、重复、跳过的数量和新增种子词数，跳过的行按电子表格行号列出原因（最多 20 行）。
- CSV 模板：第一行是表头，列名不区分大小写、顺序任意：`term`（必填）、`url`（http/https）、`observed_at`（`YYYY-MM-DD` 或带时区的 ISO 时间）、`source`、`note`。空白行忽略。导入后编辑表单重新加载，显示新的种子词。
- 右侧在 draft 或 failed 时有「运行研究」面板（说明 + [Run research]；failed 时说明改为「上次运行失败，可以再运行一次」），下方显示最近一次运行的状态和时间，失败时显示原因（含「运行在完成前停止了」：Worker 中途停止，超时后由系统标记），partial 时说明部分搜索结果没有取到。运行由 Worker 在后台执行：提交后最近一次运行显示 Queued（说明几秒后开始），页面每 2 秒刷新，直到运行和项目都结束。排队中或运行中时，最近一次运行下方有 [Cancel run]；取消后显示 Cancelled，运行面板说明「上次运行已取消，可以再运行一次」。
- Keywords 表：关键词（种子词带 `brand-soft` 的 Seed 标签）、搜索量、CPC、广告竞争、KD，数字右对齐；缺失的值显示「No data / 暂无数据」，不显示 0。数据来自测试 Provider 时，表格上方显示 `info-soft` 的提示「测试数据，不是真实的搜索数据」。
- Top search results：每个已审核关键词一个可折叠的列表（第一个展开），列出排名、标题（链接）和域名。
- 不是 draft 时表单只读，说明改为「项目正在运行，不能再改」，不显示删除和导入。budget_exhausted 例外：表单可以修改，说明为「预算在取得任何数据之前用完，提高数据预算后再运行」，运行面板说明同义。
- 摘要中的两项预算下方显示「已花费 · 预留」（来自 `/costs`）。最近一次运行因预算 failed 时显示「数据预算不够一次扩词」；因预算 partial 时说明结果只包含预算内完成的部分。
- 不属于当前用户或不存在的项目返回 404 页面。
- 状态徽章样式见 design-system.md 的 Status：draft 为 `surface-strong` + `pencil-line`；运行中各状态为 `info-soft` + `loader-circle`；completed 为 `success-soft`；failed、budget_exhausted 为 `destructive-soft`；cancelled、partial 为 `surface-strong`。
- 最近一次运行为 completed 或 partial 时，运行面板下方有 View opportunities 链接，进入只显示该项目的 `/opportunities?project=<id>`。

---

## Opportunities

还没有设计稿；页面沿用 Research 的表格、面板和徽章样式。

`/opportunities`：

```text
标题 + 说明（分数只由数据计算，不由 AI 给出）
?project= 时：「只显示一个项目」+ Show all
数据来自测试 Provider 时：info-soft 的测试数据提示
表格：机会（→ 详情，needs_review 时带 warning-soft 的 Check evidence 徽章）、项目（→ 项目详情）、分数、可信度、状态
没有机会时：空状态 + 前往 Research 的链接
```

`/opportunities/:id`：

```text
← Opportunities
组名 + 状态徽章（+ Check evidence）
项目链接 · Evaluated 时间
测试数据提示（分析或指标来自 fake 时）
左侧：分数 /100、可信度，六个维度的评分（0–5）、说明与权重，评分版本说明
右侧：surface 的 AI analysis（目标用户、任务、替代方案、差异化、定价、渠道、MVP 范围、风险）；输出无效或失败时 warning-soft 提示「分数仍然有效」；下方说明 AI 不改变分数
下方：证据关键词表（同 Research 的 Keywords 表）、Search results、Signals（词、来源、日期）
```

- 详情页证据上方：左侧是 Validation experiments（每个实验：类型、状态徽章、假设、渠道、计数的事件、成功阈值、停止条件、预算、期限、结果；没有结束的实验下方可以改状态并填写结果），下面是可展开的 Plan an experiment 表单；右侧是描边的 Decision 面板（只列出当前可做的决策的单选、Reason、[Save decision]），下方是决策历史（决策、理由、决策人、时间、评分版本与分数）。
- 证据上方是 Product brief：说明、[Download Markdown]（在浏览器生成文件，文件名 `brief-<组名>.md`）、[Copy]（复制失败时提示改用下载）和可展开的预览。
- 说明文字强调：高分不等于成功的概率；点击和候补名单不等于成交。
- 状态徽章：unreviewed 为 `surface-strong`，needs_validation 为 `info-soft`，go 为 `success-soft`，no_go 为 `destructive-soft`。
- 不属于当前用户或不存在的机会返回 404 页面。
- 机会为 go 时，Decision 面板上方有 `success-soft` 的提示：没有产品时是 [Start product]（开始后进入产品页），有产品时是 Open product 链接。

---

## Compare

- 机会列表每行有一个复选框，表格下方是 [Compare selected] 和「选择 2 到 4 个机会」的说明。表单用 GET 打开 `/opportunities/compare?id=…&id=…`。
- `/opportunities/compare`（无设计稿）：每个机会一列（标题链接到详情），行为项目、状态、分数、可信度（需要复核时带标记）、六个维度、最大关键词及其月搜索量、KD、CPC、关键词数、已审核 SERP 数、目标用户、定价、MVP 范围、风险。缺失的值显示「暂无数据」。数据来自测试 Provider 时显示测试数据提示。
- 最多比较 4 个；不属于当前用户或不存在的机会不显示。少于 2 个时显示说明。没有新的 API，页面读取 `GET /api/opportunities/:id`。

---

## Products

还没有设计稿；页面沿用 Research 的表格、面板和徽章样式。导航中的名称是 Products，路径是 `/projects`。

`/projects`：标题 + 说明；表格：名称（→ 详情）、状态徽章、域名、上线日期、创建时间；没有产品时：空状态 + 前往 Opportunities 的链接。

`/projects/:id`：

```text
← Products
名称 + 状态徽章；机会链接（机会还在时）
左侧：Results（surface 的访客、激活合计；按货币的收入表：订单、已核实订单、毛收入、退款、费用、净收入；未知显示 Unknown）+ 说明
右侧：描边的 Product 面板（名称、状态、上线日期、域名、仓库地址，[Save]）
下方左侧：Revenue 记录（日期、订单数、毛收入、退款、费用、证据、来源徽章，manual 可删除）+ 可展开的 Record revenue 表单（费用留空表示未知）
下方右侧：Visitors and activations 记录 + 可展开的表单
```

- 状态徽章：not_started、archived 为 `surface-strong`；validating、building 为 `info-soft`；launched、measuring 为 `success-soft`。
- 来源徽章：manual、imported 为 `surface-strong`；payment_verified 为 `success-soft`。手工数据不显示为已核实。
- 不属于当前用户或不存在的产品返回 404 页面。

---

## Favorites

- Radar 列表与详情、机会列表与详情的标题前有星标按钮（`aria-pressed`，屏幕阅读器标签为「收藏 / 取消收藏 <名称>」）。点击后立即改变；保存失败时恢复并在提示中说明。
- Radar 用「只看收藏」复选框，机会列表用「只看收藏 / 全部机会」链接（保留项目筛选）。没有收藏时显示说明如何收藏的空状态。

---

## Provider Settings

`/settings/providers`（无设计稿；入口在账号菜单和移动端抽屉中）：

```text
标题 + 说明
Services：Background worker（Online / Offline / Not started + 最近在线）、Keyword data、AI analysis（服务 · 模型）、Radar（开启时 Hacker News 每小时 + 条目数与最近采集时间）
fake 服务旁说明「测试数据」
说明：API Key 在 Worker 中设置，这里不显示也不能输入
Spending by provider 表：服务、预算（Data / AI）、调用、失败、已花费、预留、最近调用（OK / Failed / Running + 时间）
说明预留的含义；每个研究项目有自己的预算（链接到 Research）
```

- 没有付费调用时显示空状态。
- 不提供「测试连接」按钮：状态来自最近一次真实调用，不为检查而付费调用。

---

## Billing

`/billing` 依次显示 Checkout 提示、余额（[Buy credits] → `/pricing`）、订阅（有已付款、未结束的订阅时）、Credit 明细、购买记录。

订阅区块：方案名称 + 状态徽章；ACTIVE 显示「Renews on 日期」，CANCELING 显示「Ends on 日期」（周期结束日按 UTC 日期显示）；PAST_DUE 说明扣款失败，并链接支付 Provider 的 Customer Portal（`PaymentProvider.customerPortalUrl`；Waffo 为 `https://pancake.waffo.ai/consumer/portal/login`，用付款邮箱登录）更新付款方式。ACTIVE 和 PAST_DUE 显示 [Cancel subscription]，点击后在原位确认（[Yes, cancel] / [Keep subscription]），成功后刷新页面。站内不提供恢复已取消的订阅。

Credit 明细读取 `credit_transactions`，按 `(created_at, id)` 倒序，每页 20 条，Load more 通过 `GET /api/billing/credit-activity?cursor=` 加载。每行显示日期、内容、变动数量和变动后的余额。内容按类型显示：

| 类型                    | 内容                                  |
| ----------------------- | ------------------------------------- |
| `SIGNUP_BONUS`          | Welcome bonus                         |
| `PURCHASE`              | {套餐名} pack                         |
| `PURCHASE_REVERSAL`     | {套餐名} pack refunded                |
| `SUBSCRIPTION_GRANT`    | {方案名} subscription                 |
| `SUBSCRIPTION_REVERSAL` | {方案名} subscription refunded        |
| `TASK_DEBIT`            | Task                                  |
| `TASK_REFUND`           | Refund · failed task                  |
| `ADMIN_ADJUSTMENT`      | Adjusted by support（不显示内部原因） |

购买记录：日期、套餐、金额、Credits、状态（Pending / Paid / Failed / Refunded）。

Checkout 跳回 `?checkout=success` 且最新购买为 Pending 或 Paid 时，或订阅 Checkout 跳回 `?checkout=subscription` 且用户有订阅时，显示 Checkout 提示：每 3 秒刷新页面，直到到账；60 秒仍未到账时提示稍后刷新或联系支持。到账后 Credit 明细同时显示新的一行。

---

## Admin

`/admin`（用户搜索）和 `/admin/users/:id`（用户详情），只做桌面端，noindex。非管理员访问返回 404。访问规则见 [Admin Access](../architecture/security.md#admin-access)。

- 搜索：按 email 或 user id 查找用户。
- 用户详情：user id、注册时间、余额和对账结果（余额与流水不一致时显示红色提示）、调整 Credits 表单（每次最多 ±1000，原因必填）、Credit 流水、Tasks、Purchases。
- 管理台文案也在 messages 的 `admin`，en + zh。

---

## Cookie Banner

Analytics 启用时，用户还没有选择就在页面底部显示 Cookie Banner：说明 + Privacy Policy 链接 + Decline / Accept。PostHog 只在 Accept 后加载。页脚的 Cookie settings 重新打开 Banner。规则见 [Analytics](../architecture/observability.md#analytics)。

---

## Legal Pages

`/terms`、`/privacy`、`/refund-policy`（只在 billingEnabled 时），共用 `LegalPage`。文案在 messages 的 `legal.terms`、`legal.privacy`、`legal.refund`：`title`、`description`、`sections`（按 JSON 中的顺序渲染）。

运营主体、支持邮箱和退款规则必须与产品实际一致；上线前由维护者确认全文。

---

## 404 & Error Pages

404 和渲染出错页共用 `StatusPage`：只有 Logo 的顶栏，内容居中：圆形图标、标题、说明、一个主按钮 + 一个次按钮。

| 页面                    | 图标               | 按钮                             |
| ----------------------- | ------------------ | -------------------------------- |
| 404（`not-found.tsx`）  | `search-x`，中性   | Go to homepage · Go to dashboard |
| 渲染出错（`error.tsx`） | `circle-alert`，红 | Try again · Go to dashboard      |

根布局本身出错时，`global-error.tsx` 上报 Sentry 并显示 Next.js 默认错误页（这里没有 i18n，不显示自己的文案）。

---

## Blog Pages

`/blog` 列出全部文章，`/blog/{slug}` 是一篇文章。每篇回答一个信息型搜索词，slug 就是这个词的简写。交易型的词由 Landing 和 Pricing 承接。

```text
/blog：Eyebrow + 标题 + 简介 + 文章列表（更新日期、标题、摘要、Read 链接）→ CTA
/blog/{slug}：面包屑（Blog / 文章）→ H1 + 摘要 + 更新日期 → 正文 → Keep reading → CTA
正文：章节（H2 + 段落，可选编号步骤或列表）
```

- 文案在 messages 的 `blog.posts.{key}`，en + zh。正文章节在 `sections` 下，按 JSON 中的顺序渲染（与法律页面相同）。
- 文章列表、发布和更新日期、`target`、`related` 在 `apps/web/src/components/blog/posts.ts`。新增文章：在 `posts.ts` 加一项、在每个 locale 的 messages 加文案。列表和 sitemap 自动包含。
- 现在只有 `getting-started`（Termrise 入门）。新文章按 [Keyword Matrix](#keyword-matrix) 的 Brief 写。没有 `related` 时不显示 Keep reading。
- 正文最多一个链接，指向这篇文章的转化页面（`posts.ts` 的 `target`）。链接写在 messages 的正文中，用 `<link>…</link>` 标出锚文字；锚文字用主题词或品牌名，不用 "click here"。标题和摘要不放链接。
- Keep reading：每篇在 `related` 中手动指定其他文章，显示标题和摘要（移动端不显示摘要）。
- CTA：未登录进入 `/sign-up`，已登录进入 `/dashboard`。
- 写到第三方平台的规则时，只写官方文档里的事实，并在 `posts.ts` 注释中记下来源链接和核对日期。
- 每篇人工写，不为凑数量发薄内容。

---

## SEO

```text
title / description：按 locale（来自 messages 的 meta）。默认 title 用 meta.homeTitle；子页面 title 用模板 "{页面} · {meta.title}"

Open Graph image：/opengraph-image，静态，使用 en 文案。页面设置自己的 openGraph 时，必须保留布局的 image、type 和 locale（Next.js 会整体替换 openGraph）

canonical：每个公开页面指向自己的 URL（不带 query）

/sign-in、/sign-up：noindex；/admin：noindex, nofollow

/pricing description：pricing.metaDescription，Single 价格和最低每次价格从 CREDIT_PACKS 计算，订阅月价从 SUBSCRIPTION_PLANS 读取

结构化数据：首页 JSON-LD（Organization、WebSite、SoftwareApplication），价格区间从 CREDIT_PACKS 计算；Blog 文章 JSON-LD（BlogPosting、BreadcrumbList）。只写页面上可见的事实，不写评分和评论

sitemap.xml：/、/pricing、/blog 和全部文章、/terms、/privacy、/refund-policy。只有 Blog 带 lastmod：文章用 posts.ts 的 updated，/blog 用最新文章的 updated；其他页面没有可靠日期，不写

法律页面 description：legal.<page>.description，每页单独一句

robots.txt：允许 /，禁止 /dashboard、/billing、/api

IndexNow：public/<key>.txt 只包含 Key，供搜索引擎验证 IndexNow 提交（pnpm indexnow）

llms.txt：apps/web/public/llms.txt 静态英文产品摘要（llmstxt.org 格式），链接写产品的正式域名；产品文案或价格变化时手动同步；`billingEnabled` 改为 `true` 时加上 Pricing 和 Refund Policy 的链接
```

除静态 `llms.txt` 外，绝对 URL 以 `APP_URL` 为根，请求时读取，不在 build 时固定。

URL 不带 locale 前缀，搜索引擎只抓取 en 版本。

---

## Keyword Matrix

每个页面承接一组搜索意图相同的关键词（Cluster）。先验证关键词机会，再建页面。流程由项目 Skill `seo-keyword-matrix`（`.claude/skills/seo-keyword-matrix/`，Codex 经 `.agents/skills/` 的符号链接读取）执行。只有 Skill 用的脚本放在 Skill 的 `scripts/`（JS，用 `node` 直接运行）；矩阵校验是站点规则，放在 `@repo/seo`：确认收录 → 导入关键词 → 按 SERP 重叠聚类 → 打分 → 映射页面 → 写 Brief → 校验 → 上线后用 Search Console 的查询 × 页面数据找出蚕食和排名 8–20 的页面。

```text
seo/keywords.csv          候选词（规范化后的小写词、搜索量、难度、来源），Skill 的 scripts/import.mjs 合并工具导出
seo/matrix.json           Cluster：关键词、意图、五项评分（1–5）、页面类型与 URL、状态
seo/briefs/{id}.md        planned / published Cluster 的内容 Brief
```

- 一个关键词只属于一个 Cluster；一个 URL 只承接一个未 rejected 的 Cluster。
- 页面类型与意图（`packages/seo/src/keyword-matrix.ts` 的 `PAGE_TYPES`）：`blog` 承接信息型和商业调研型，`landing` 承接交易型和导航型，`pricing` 承接交易型和商业调研型。新的页面类型（`/for/*`、`/compare/*`）是 Scope 扩大，先确认再加。
- 状态：`candidate` → `planned`（Brief 已写）→ `published`（页面已上线）；`rejected` 保留不要的词和理由。
- 机会分数（Skill 的 `scripts/score.mjs`，0–100）只用于初筛。第一批选 `business`、`intent`、`productFit` 都不低于 4 分的 Cluster。
- 校验：`pnpm seo:validate`（`packages/seo/src/keyword-matrix.ts`），`pnpm test` 也运行。`published` 的 URL 必须是站点已有的页面（`/`、`/pricing`、Blog 文章）。
- Starter 带的 Cluster 和 Brief 是示例，换成产品自己的数据。
- Skill 的效果用 `.claude/skills/seo-keyword-matrix/evals/` 检查（3 个场景、脚本评分、可与不带 Skill 的对照组比较）。修改 Skill 后重新运行。
- 关键词只做 en：搜索引擎只抓取 en 版本。页面文案仍按 [Internationalization](#internationalization) 写全部 locale。
