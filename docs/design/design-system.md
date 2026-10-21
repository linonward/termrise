# Design System

Termrise 的视觉规则：token、字体、组件和已有页面的布局。代码中的唯一实现是 `packages/ui/src/styles/theme.css`（token）和 `packages/ui/src/components/`（基础组件）。

设计稿用 [Pen](https://pen.dev) 画，见 [Design Tool](#design-tool)。设计文件的变量名与 CSS 变量名一一对应（设计文件 `foreground` → CSS `--foreground`）。

### Design Tool

- 工具：Pen 桌面应用（macOS，安装在 `/Applications/Pen.app`）。
- 位置：设计文件是 `docs/design/app.pen`。导出的 PNG 放在 `docs/design/exports/`，文件名是画板名的 kebab-case（`Foundation / Color` → `foundation-color.png`）。
- 结构：画布从上到下分三个容器，每个容器顶部是标题，下方横排画板：
  - `Foundation`：`Foundation / Color`、`Typography`、`Radius & Spacing`、`Brand`、`Logo`、`Icon`。
  - `Components`：`Components / Base`（Starter 的组件，即 [Components](#components) 表中的组件）和 `Components / Product`（Termrise 业务组件：表单字段、Badge 与 Tag、关键词表、分数、页面标题区、搜索结果组、空状态）。
  - `Pages`：页面画板，桌面端 1440、移动端 390。新页面画板加在这一行的末尾。
- 变量：颜色变量带 `mode` 主题轴（`light` / `dark`）；另有 `font-heading`、`font-sans`、`font-mono` 和 `radius-sm` / `radius-md` / `radius-lg` / `radius-pill`。
- Agent 接入：仓库根目录的 `.mcp.json` 注册 Pen 的 MCP Server（`pencil`）。先打开 Pen 应用，再启动 Agent。
- `.pen` 文件是加密格式。只能用 Pen 应用或 `pencil` MCP 工具读写，不用文本工具读取或修改。Git 把它当作二进制文件（`.gitattributes`），不做 diff 和合并；两个分支不同时修改同一个 `.pen` 文件。
- `.pen` 文件和 PNG 不参与格式化（`.prettierignore`）。

修改设计的流程：

```text
改设计文件
↓
导出受影响画板的 PNG
↓
token 或组件有变化时，同步更新本文件和 `packages/ui/src/styles/theme.css`
```

新界面先画设计稿，再写代码。

---

## Principles

- **像一份研究报告。** 结果和证据是主角：暖纸色 `background`、墨黑文字、衬线标题、等宽数字。不加装饰性渐变、插画或阴影。
- **细线分隔，少用卡片。** 区块之间优先用 `border` 细线和留白分隔；只有表单、可操作的面板和摘要才用描边面板或 `surface` 底。
- **一屏一个主操作。** 主操作用 `primary` 按钮（浅色模式为墨黑，深色模式为米白），每个区块最多一个。
- **浅色、深色两套主题。** 两套主题共用同一组 token，只是取值不同（见 [Theming](#theming)）。组件和页面只引用 token，不为某个主题单独写颜色。
- **品牌色克制使用。** `brand`（朱红，表示上升）只用于 Logo、Credits 图标、焦点环、收藏星标、空状态图标和选中/强调的小面积元素，不做大面积背景，也不做按钮底色。它与 `destructive` 同属红色系，不用它表示错误。
- **状态必须可见。** 每个任务和购买状态都有固定的颜色（见 [Status](#status)）。

产品换品牌色时，只改 `brand`、`brand-soft`、`brand-text`、`brand-foreground` 四个 token，并重新核对下方的对比度规则。

---

## Tokens

在 `packages/ui/src/styles/theme.css` 中声明（浅色在 `:root`，深色在 `.dark`），通过 `@theme inline` 暴露为 Tailwind 颜色（如 `bg-surface`、`text-brand-text`），并映射到 shadcn/ui 使用的变量。

### Color

| Token                              | Light                 | Dark                  | 用途                                     |
| ---------------------------------- | --------------------- | --------------------- | ---------------------------------------- |
| `background`                       | `#FAF8F3`             | `#14130F`             | 页面背景（暖纸色）                       |
| `surface`                          | `#F2EEE5`             | `#1D1C17`             | 次级区域（摘要、Credits 卡片、展示面板） |
| `surface-strong`                   | `#E8E3D7`             | `#2A2822`             | 占位、头像底色、中性徽章                 |
| `border`                           | `#E3DDD0`             | `#2D2B24`             | 分隔线、卡片描边                         |
| `border-strong`                    | `#CFC7B6`             | `#3D3A31`             | 输入框、Secondary 按钮描边               |
| `foreground`                       | `#16140F`             | `#F2EFE6`             | 主文字（墨黑）                           |
| `muted-foreground`                 | `#5C574C`             | `#A9A395`             | 次要文字、标签                           |
| `subtle-foreground`                | `#8A8475`             | `#7F796C`             | 占位符、计数器、脚注、「No data」        |
| `primary`                          | `#16140F`             | `#F2EFE6`             | 主按钮底色                               |
| `primary-hover`                    | `#2D2A22`             | `#DAD5C8`             | 主按钮悬停                               |
| `primary-foreground`               | `#FAF8F3`             | `#14130F`             | 主按钮文字                               |
| `brand`                            | `#D4401A`             | `#D4401A`             | Logo、Credits 图标、焦点环、收藏星标     |
| `brand-soft`                       | `#FBE8DF`             | `#3A1B10`             | 品牌色浅底（Seed、Most popular 标签）    |
| `brand-text`                       | `#B5360E`             | `#FF8B66`             | `background` 上的品牌色文字              |
| `brand-foreground`                 | `#FFFFFF`             | `#FFFFFF`             | `brand` 底色上的文字                     |
| `success` / `success-soft`         | `#1E7A3C` / `#E5F1E3` | `#62CF8A` / `#13291A` | 成功、已付款、Go、Save 标签              |
| `info` / `info-soft`               | `#2752B8` / `#E7EDF8` | `#8DAEFF` / `#18213A` | 处理中、等待到账、测试数据提示           |
| `warning` / `warning-soft`         | `#8F5400` / `#F9EDD3` | `#EDB24B` / `#2E2410` | 提醒（到账超时、Check evidence、跑题）   |
| `destructive` / `destructive-soft` | `#B42318` / `#FAE6E3` | `#FF7D70` / `#3A1715` | 失败、错误                               |
| `overlay`                          | `#16140FCC`           | `#16140FCC`           | 媒体上的遮罩                             |

对比度规则：

- 品牌色文字一律用 `brand-text`，不用 `brand`（浅色模式下 `brand` 在 `background` 上只有 4.35:1）；`brand` 底色上只放 `brand-foreground`（4.62:1）。
- 状态色文字只放在 `background` 或对应的 `*-soft` 底上（两套主题都 ≥ 4.6:1）。
- 除 `subtle-foreground` 外，两套主题的文字组合都满足 WCAG AA（≥ 4.5:1）。`subtle-foreground` 在浅色模式下只有 3.5:1，只用于占位符、计数器、脚注和「No data」，不用于必须阅读的内容。
- `background`、`surface`、`surface-strong` 之间的明度差都 ≥ 8%，嵌套的面板不靠阴影也能区分。

与 shadcn/ui 的映射：shadcn 的 `--accent` 指悬停背景，映射到 `surface-strong`；品牌色使用独立的 `--brand*` 变量，不占用 `--accent`。`--ring` 映射到 `brand`。

### Theming

- 代码中用 `next-themes`（`attribute="class"`）切换 `<html>` 上的 `.dark` class，可选 System / Light / Dark，默认 System（跟随 `prefers-color-scheme`）。偏好只存在浏览器本地，不写数据库。
- `brand`、`brand-foreground`、`overlay` 两套主题取值相同，`.dark` 中不重复声明。
- 设计文件中颜色变量带 light / dark 主题轴。深色画板复制自对应浅色画板，只切换主题；没有单独画的深色页面按 token 自动得到。
- 叠在媒体上的控件和遮罩（白色图标、`overlay`）两套主题相同，不受页面背景影响。用户上传或生成的内容不做深色处理。

### Typography

| 角色    | 字体           | 字号 / 字重                                    |
| ------- | -------------- | ---------------------------------------------- |
| Display | Source Serif 4 | 56 / 600，letter-spacing −1.2                  |
| H1      | Source Serif 4 | 36 / 600，letter-spacing −0.6（移动端 28）     |
| H2      | Source Serif 4 | 24 / 600（移动端 20）                          |
| H3      | Inter          | 18 / 600                                       |
| Body    | Inter          | 15 / 400，line-height 1.5                      |
| Small   | Inter          | 13 / 500                                       |
| Caption | Inter          | 12 / 600，大写，letter-spacing 1               |
| Data    | JetBrains Mono | 14 / 500，`tabular-nums`（表格中的数字、余额） |

- 标题用衬线体，让页面读起来像一份报告；Source Serif 4 加载 `opsz` 轴，浏览器按字号自动选择光学尺寸（不固定），大字号用较紧的展示字形。正文保留 Inter，适合密集的数据表。
- 中文回退字体：标题为 `Noto Serif SC`、`Songti SC`；正文为 `Noto Sans SC`、`PingFang SC`（三种拉丁字体都不含中文字形）。中文段落不加负的 letter-spacing。
- 表格中的数字（搜索量、CPC、KD、维度分、Credits）用 `font-mono`，右对齐。大号的分数和价格仍用 `font-heading`，加 `tabular-nums`。
- 缺失的数值显示「No data / 暂无数据」，用 `subtle-foreground`，不显示 0。
- 字体通过 `next/font/google` 加载（`layout.tsx`）；标题用 `font-heading`，正文用默认的 `font-sans`，数字用 `font-mono`。

### Radius

| Token         | 值  | 用途                          |
| ------------- | --- | ----------------------------- |
| `radius-sm`   | 4   | 小元素、复选框                |
| `radius-md`   | 6   | 按钮、输入框、选项、Alert     |
| `radius-lg`   | 10  | 卡片、媒体、面板              |
| `radius-pill` | 999 | 徽章、Tag、Credits pill、头像 |

`radius-pill` 在代码中用 `rounded-full`。

### Spacing

使用 Tailwind 默认的间距刻度（1 = 4px，例如 `p-5` = 20px、`gap-1.5` = 6px）。常用值：4、8、12、16、24、32、48、64。不使用任意值（例如 `p-[13px]`）。桌面端的 120 和 72 也用刻度类（`md:px-30`、`md:pt-18`、`md:h-18`）。

---

## Layout

|          | Desktop                         | Mobile                                |
| -------- | ------------------------------- | ------------------------------------- |
| 画板宽度 | 1440                            | 390                                   |
| 内容区   | 左右 padding 120（内容宽 1200） | 左右 padding 20                       |
| 顶部导航 | `Top Nav`，高 64                | `Mobile Top Bar`，高 56，菜单收进抽屉 |

断点：`< 768` 使用移动端布局，`≥ 1024` 使用桌面端布局，中间按桌面端布局缩小 padding。

---

## Components

基础组件在 `packages/ui/src/components/`（shadcn/ui 风格，已改为使用上方 token），设计稿中在 `Components / Base` 画板。新组件优先从这里组合；需要新的基础组件时，先画进设计文件，再加到这里和下表。

| 组件                                  | 代码实现                        | 说明                                                                                                                                                      |
| ------------------------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Button/Primary`                      | `Button` default                | 每个区块的主操作                                                                                                                                          |
| `Button/Secondary`                    | `Button` outline                | 次要操作（Buy credits、Load more）                                                                                                                        |
| `Button/Ghost`                        | `Button` ghost                  | 取消、行内操作、页脚的语言和主题切换                                                                                                                      |
| `Button/Large`                        | `Button` + `h-12 px-6`          | 页面级主操作：Landing CTA、Run                                                                                                                            |
| `Dropdown Menu`                       | `DropdownMenu`                  | 用户菜单、语言和主题选择（单选项）                                                                                                                        |
| `Sheet`                               | `Sheet`                         | 移动端菜单抽屉                                                                                                                                            |
| `Popover`                             | `Popover`                       | 已提供，Starter 页面暂未使用                                                                                                                              |
| `Toggle Group`                        | `ToggleGroup` / `Toggle`        | 已提供，Starter 页面暂未使用；用于互斥选项                                                                                                                |
| `Credits Pill`                        | 自定义（`app-nav.tsx`）         | 导航栏中的余额，`surface` 底 + `border` 描边，`brand` 色 `coins` 图标，链接到 Billing                                                                     |
| `Top Nav` / `Mobile Top Bar`          | `AppNav`                        | 链接为 Dashboard · Radar · Research · Opportunities · Products（Billing 只在收费时）；当前页链接加粗 + 2px 下划线；右侧常驻余额和头像（移动端为菜单按钮） |
| `Marketing Nav`                       | `MarketingNav`                  | 公开页面顶栏；链接 14 / 500 `muted-foreground`，当前页 600 `foreground`                                                                                   |
| `Status Badge`                        | 自定义（`purchase-status.tsx`） | 高 24、`rounded-full`、12 / 600 大写，图标 14；颜色见 [Status](#status)                                                                                   |
| `Alert`                               | 自定义（`checkout-status.tsx`） | `*-soft` 底、`radius-md`、padding 16，左侧 18px 状态图标，标题 14 / 600 + 说明 13 `muted-foreground`                                                      |
| `Pricing Card`                        | 自定义（`pricing-plans.tsx`）   | 推荐 Pack 描边加粗为 `primary` 2px，显示 `brand-soft` 的 Most popular 标签；Pack 加 `success-soft` 的 Save 标签                                           |
| `Plan Card`                           | 自定义（`pricing-plans.tsx`）   | 订阅方案整行卡片，`/Desktop` 横排、`/Mobile` 单列；样式同非推荐 Pack，`brand-soft` 的 Subscription 标签，按钮为 outline                                   |
| `Cookie Banner`                       | 自定义（`cookie-banner.tsx`）   | 固定在底部，`background` 底 + `border` 描边，Decline（outline）+ Accept（default）                                                                        |
| `Status Page`                         | 自定义（`status-page.tsx`）     | 404 与错误页，见下方页面说明                                                                                                                              |
| `Media/Image`                         | 未实现                          | 结果图片，`radius-lg`，裁切填满；悬停时右上角显示 `overlay` 圆形下载按钮（白色图标）                                                                      |
| `Media/Video` / `Media/Video Playing` | 未实现                          | 16:9 视频；暂停时居中 56px 播放按钮 + 右下角时长；播放时底部为控制条（`overlay` 底，白色图标和文字）                                                      |
| `Media/Running` / `Media/Failed`      | 未实现                          | 与结果同尺寸的占位：处理中为 `loader-circle`（`info`，旋转）；失败为 `circle-x`（`destructive`）+ Credits 已退回                                          |
| `Media/Thumbnail`                     | 未实现                          | 72px 缩略图，`radius-md`，右上角为移除按钮                                                                                                                |
| `Upload/Dropzone`                     | 未实现                          | 上传区，`surface` 底 + `border-strong` 描边；提示 JPG、PNG、WebP，最大 10 MB（与上传限制一致）                                                            |
| `Upload/Progress`                     | 未实现                          | 上传中的文件：预览、文件名、`primary` 进度条、百分比、取消按钮                                                                                            |

### Product Components

`Components / Product` 画板中的 Termrise 业务组件。状态徽章的色调和图标只在 `apps/web/src/lib/status-badges.ts` 中定义，页面通过 `StatusBadge`（`components/status-badge.tsx`）使用。

| 组件                                              | 代码位置                                 | 说明                                                                                                                                                                               |
| ------------------------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Field/Input` / `Field/Textarea` / `Field/Select` | `features/research/research-form.tsx` 等 | 标签 13 / 500，输入框高 44（Textarea 120）、`border-strong` 描边、`radius-md`、padding 12 / 16，下方提示 13 `muted-foreground`；Select 右侧 `chevron-down`                         |
| `Field/Input Focus` / `Field/Input Error`         | 同上                                     | 焦点为 2px `brand` 描边；错误为 `destructive` 描边，提示改为 `destructive` 文字                                                                                                    |
| `Field/Read Only`                                 | 同上                                     | `surface` 底 + `border` 描边，值为 `muted-foreground`（如 Market）                                                                                                                 |
| `Checkbox/On·Off` / `Radio/On·Off`                | `decision-form.tsx`、Radar 筛选          | 18px；选中为 `primary` 底 + `primary-foreground` 对勾或圆点；未选中为 `border-strong` 描边。复选框圆角 4，单选框为圆形                                                             |
| `Badge/Neutral·Info·Success·Warning·Danger`       | `@repo/ui/components/badge` 的 `Badge`   | 所有状态徽章的唯一样式：高 24、`radius-pill`、图标 14 + 12 / 600 大写；颜色和图标见 [Status](#status)                                                                              |
| `Tag/Neutral` / `Tag/Brand`                       | `@repo/ui/components/badge` 的 `Tag`     | 不表示状态的标签：高 20、`radius-pill`、12 / 600、不大写、无图标。Neutral 用于来源（Hacker News、Google Trends、CSV import、Manual），Brand 用于 Seed 和 Most popular              |
| `Keyword Table/Head` / `Keyword Table/Row`        | `research-results.tsx`                   | 列：Keyword（可带 Seed 标签）、Volume、CPC、Competition、KD、Topic；数字列 `font-mono` 右对齐；行间 `border` 分隔，无底色                                                          |
| `Topic Toggle/On` / `Topic Toggle/Off`            | `off-topic-toggle.tsx`                   | 高 28、`radius-md`；On 为 `border` 描边 + `circle-check`；Off 为 `warning-soft` 底 + `circle-slash`、`warning` 文字；右侧 12 / 500 的标记来源（AI / You）                          |
| `Score Summary`                                   | `opportunities/[id]/page.tsx`            | 左侧 SCORE 标签 + 36 / 600 衬线分数 + 20 号 `/100`；右侧 CONFIDENCE 标签 + 24 / 600 数值                                                                                           |
| `Dimension Row`                                   | 同上                                     | 维度名 15 / 500 + 13 号说明；右侧 5 格评分条（8px 方块，得分格为 `foreground`，其余为 `surface-strong`），代码在 `opportunities/[id]/page.tsx` 的 `Rating`+ `font-mono` 分值、权重 |
| `Stat`                                            | Research 摘要、Products Results          | 12 / 600 大写标签 + 24 / 600 衬线数值 + 13 号说明（如「已花费 · 预留」），放在 `surface` 面板中                                                                                    |
| `Page Header`                                     | 各详情页                                 | `Back Link` → 标题行（收藏星标 + H1 + 状态徽章）→ 元信息（带下划线的上级链接 · 时间）                                                                                              |
| `Back Link`                                       | 各详情页                                 | `arrow-left` 16 + 15 / 500 文字                                                                                                                                                    |
| `Star Button/On·Off`                              | `favorites/star-button.tsx`              | 32×32、`border` 描边、`radius-md`；收藏后星标为 `brand`，未收藏为 `muted-foreground`                                                                                               |
| `SERP Group`                                      | `research-results.tsx`                   | 顶部 `border` 细线；标题行为折叠箭头 + 关键词 15 / 600 + 结果数；每条结果为 `font-mono` 排名 + 标题 15 / 500 + 域名 13 `muted-foreground`，行间细线                                |
| `Empty State`                                     | `components/empty-state.tsx`             | 上下 `border-strong` 细线、无底色；`brand` 图标 20 → H3 衬线标题 → 说明 → `Button/Secondary`；页面中的小区块只显示说明                                                             |

---

## Status

任务状态（示例 Task，`messages` 的 `status`）在结果列表中只显示文字，不用徽章：

| 状态      | 文案      | 显示内容                   |
| --------- | --------- | -------------------------- |
| PENDING   | Running   | 输入                       |
| SUCCEEDED | Succeeded | 结果                       |
| FAILED    | Failed    | 失败说明（Credits 已退回） |

产品需要状态徽章时，使用下方 Purchase 的同一套样式：处理中用 `info-soft` / `info` + 旋转的 `loader-circle`，成功用 `success-soft` / `success` + `circle-check`，失败用 `destructive-soft` / `destructive` + `circle-x`。

Termrise 的状态徽章都用 `Badge/*` 组件（色调 / 图标，lucide）：

| 分组          | 状态与样式                                                                                                                                                                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Research 项目 | draft：Neutral / `pencil-line`；collecting、expanding、enriching、clustering、auditing、evaluating：Info / `loader-circle`；completed：Success；partial：Neutral / `circle-dashed`；budget_exhausted、failed：Danger；cancelled：Neutral / `ban` |
| Research 运行 | Queued：Info / `hourglass`；Running：Info / `loader-circle`；Completed：Success；Failed：Danger                                                                                                                                                  |
| 机会          | unreviewed：Neutral / `circle-dashed`；needs_validation：Info / `flask-conical`；go：Success；no_go：Danger；Check evidence：Warning / `triangle-alert`                                                                                          |
| 建站建议      | new_site：Success / `globe`；inner_page：Info / `file-text`；weak_demand：Neutral / `trending-down`；unknown：Neutral / `minus`                                                                                                                  |
| Radar 趋势    | breakout：Success / `trending-up`；emerging：Info / `sprout`；sustained：Neutral / `activity`；recurring：Neutral / `repeat`；seasonal：Neutral / `calendar`；insufficient_data：Neutral / `minus`                                               |
| 产品          | not_started：Neutral / `circle-dashed`；validating：Info / `flask-conical`；building：Info / `hammer`；launched：Success / `rocket`；measuring：Success / `chart-line`；archived：Neutral / `archive`                                            |
| 实验          | planned：Neutral / `calendar`；running：Info / `loader-circle`；passed：Success；failed：Danger；stopped：Neutral / `octagon-x`                                                                                                                  |
| 收入来源      | manual、imported：`Tag/Neutral`；payment_verified：Success / `shield-check`                                                                                                                                                                      |

未写图标的状态用该色调的默认图标：Success 为 `circle-check`，Danger 为 `circle-x`。来源（Hacker News、Google Trends、CSV import）不是状态，用 `Tag/Neutral`。

Purchase 状态徽章（Billing 页的购买记录）：

| 状态     | 徽章（底色 / 文字）                   | 图标（lucide） |
| -------- | ------------------------------------- | -------------- |
| PENDING  | `surface-strong` / `muted-foreground` | `hourglass`    |
| PAID     | `success-soft` / `success`            | `circle-check` |
| REFUNDED | `surface-strong` / `muted-foreground` | `rotate-ccw`   |
| FAILED   | `destructive-soft` / `destructive`    | `circle-x`     |

订阅状态徽章（Billing 页的订阅区块，同一套样式，`subscription-status.tsx`）：

| 状态      | 徽章（底色 / 文字）                   | 图标（lucide） |
| --------- | ------------------------------------- | -------------- |
| ACTIVE    | `success-soft` / `success`            | `circle-check` |
| PAST_DUE  | `warning-soft` / `warning`            | `circle-alert` |
| CANCELING | `surface-strong` / `muted-foreground` | `hourglass`    |

Checkout 跳转回 Billing 页后的提示使用 `Alert`：等待到账为 `info-soft` + `loader-circle`（旋转），到账为 `success-soft` + `circle-check`，60 秒仍未到账为 `warning-soft` + `circle-alert`。

---

## Logo

`LogoMark`（`apps/web/src/components/logo-mark.tsx`，内联 SVG，viewBox 240）是 Termrise 的标记：`brand` 色的上升折线和箭头（`LOGO_RISE_PATH`），起点是 `foreground` 色的圆点（`LOGO_DOT_PATH`），表示「从一个词开始的上升趋势」。标记用 Pen 的 SVG 生成后整理为两条 path，一条用 `fill-brand`、一条用 `fill-foreground`，深色主题自动适配。

- `Logo/Full`：标记 + 品牌名（`meta.title`，Source Serif 4 600），用于桌面端导航、Landing、页脚。
- `Logo/Icon`：只有标记，用于移动端应用顶栏（品牌名保留为 `sr-only`）。

App Icon / favicon（`apps/web/src/app/icon.svg`、`apps/web/src/app/apple-icon.png`、`apps/web/src/app/favicon.ico`）固定为 `#16140F` 底、`#D4401A` 折线、白色圆点，不随主题变化；PNG 和 ICO 由 `icon.svg` 渲染（180 / 48 / 32 / 16 px）。Open Graph 图（`apps/web/src/app/opengraph-image.tsx`）使用同样的两条 path。换标记时这几处一起改。

---

## Page Notes

已有页面的布局要点。页面结构和交互规则在 `docs/product/ux.md`。

Dashboard：标题下是 `surface` 的 Credits 卡片（余额 36 / 700 `tabular-nums`，桌面端右侧 `Button/Secondary` 的 Buy credits），下方是 TaskPanel：`textarea`（`border-strong` 描边、`radius-md`，焦点环 `brand`）、`Button/Large`、`border` 描边的结果列表。

Research（`/research`、`/research/:id`）：画板 `Research / Desktop`、`Research Project / Desktop`、`Research / Mobile · Empty`。列表与 Billing 的表格同一样式；新建表单为 `border` 描边、`radius-lg` 的面板（移动端去掉描边），输入框同 TaskPanel 的 textarea（高 44）；详情页右侧是 `surface` 摘要（12 / 600 大写标签 + 24 / 600 数值）。研究状态徽章沿用 Status 一节的样式。

Billing（`/billing`）：标题下依次是 Checkout 提示、`surface` 余额面板、订阅面板（有订阅时）、Credit 明细表、购买记录表。订阅面板用 `border` 描边、`radius-lg`，无底色；左侧是 12 / 600 大写 `muted-foreground` 标签、方案名（24 / 600）+ 状态徽章（样式同购买记录的状态徽章：ACTIVE `success-soft`，PAST_DUE `warning-soft`，CANCELING `surface-strong`）、15 号 `muted-foreground` 的续费或结束日期；PAST_DUE 时改为说明文字 + 600 字重下划线链接；桌面端右侧是 `Button/Secondary` 的 Cancel subscription（只在订阅已激活、状态为 ACTIVE 或 PAST_DUE 时显示），确认时并排 `Button` destructive 和 `Button/Secondary`。表头 12 / 600 大写 `muted-foreground`，行间 `border` 分隔。Credit 明细四列：日期、内容、Credits、余额。Credits 列 600 字重；增加写作 `+n`，用 `success`；减少写作 `−n`（U+2212），用 `foreground`。表格下方居中放 `Button/Secondary` 的 Load more（无图标）。

Admin：内部页面，只做桌面端。顶栏只有 Logo 和 `surface-strong` 的 `ADMIN` 标签，不用 `Top Nav`。用户详情页：`surface` 面板左侧是余额和对账结果，右侧是调整 Credits 表单；下方三张表（Credit 流水、Tasks、Purchases）与 Billing 的表格样式相同。

Pricing（`/pricing` 与 Landing 的 Pricing 区块共用）：每个 Pack 一张 `Pricing Card`。宽度 ≥ 1280 时 4 列，平板 2 列，移动端单列；放不下时 Save 标签整体换行。Pack 下方每个订阅方案一张整行卡片（样式同非推荐 Pack，`brand-soft` 标签），桌面端横排：名称与价格、权益两列、按钮；移动端单列。下方 `surface` 说明栏 3 项：每次消耗、失败退款、新账号赠送。

Login / Signup：桌面端左侧是表单，右侧是 `surface` 展示面板（Hero 标题 + 注册赠送说明）；移动端只保留表单，赠送说明放在表单下方。

Blog：正文列宽 720。文章页标题区为面包屑（`brand-text` 链接）、H1、摘要、更新日期（13 / 500 `subtle-foreground`）。编号步骤用 24px `brand-soft` 圆形序号，列表用 6px `brand-text` 圆点。Keep reading 标题与节标题同级，下方是顶部带 `border` 分隔线的文章列表。

404 与错误页：只有 Logo 的顶栏，内容居中：64px 圆形图标底（404 用 `surface-strong`，错误用 `destructive-soft`）、标题、说明、一个主按钮 + 一个次按钮。
