# Design System

Starter 的视觉规则：token、字体、组件和已有页面的布局。代码中的唯一实现是 `packages/ui/src/styles/theme.css`（token）和 `packages/ui/src/components/`（基础组件）。

设计稿用 [Pen](https://pen.dev) 画，见 [Design Tool](#design-tool)。设计文件的变量名与 CSS 变量名一一对应（设计文件 `foreground` → CSS `--foreground`）。

### Design Tool

- 工具：Pen 桌面应用（macOS，安装在 `/Applications/Pen.app`）。
- 位置：设计文件是 `docs/design/app.pen`。导出的 PNG 放在 `docs/design/exports/`，文件名是画板名的 kebab-case（`Foundation / Color` → `foundation-color.png`）。
- 结构：第一行是 Foundation 画板（`Foundation / Color`、`Typography`、`Radius & Spacing`、`Brand`、`Logo`、`Icon`），下方是 `Components` 画板，包含 [Components](#components) 表中的全部可复用组件。页面画板放在 `Components` 下方。
- 变量：颜色变量带 `mode` 主题轴（`light` / `dark`）；另有 `font-heading`、`font-sans` 和 `radius-sm` / `radius-md` / `radius-lg` / `radius-pill`。
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

- **结果是主角。** 界面保持安静：`background` 底、中性灰，大面积留白；不加装饰性渐变、插画或阴影。
- **一屏一个主操作。** 主操作用 `primary` 按钮（浅色模式为 ink 黑，深色模式为米白），每个区块最多一个。
- **浅色、深色两套主题。** 两套主题共用同一组 token，只是取值不同（见 [Theming](#theming)）。组件和页面只引用 token，不为某个主题单独写颜色。
- **品牌色克制使用。** `brand` 只用于 Logo、Credits 图标、焦点环和选中/强调的小面积元素，不做大面积背景，也不做按钮底色。
- **状态必须可见。** 每个任务和购买状态都有固定的颜色（见 [Status](#status)）。

产品换品牌色时，只改 `brand`、`brand-soft`、`brand-text`、`brand-foreground` 四个 token，并重新核对下方的对比度规则。

---

## Tokens

在 `packages/ui/src/styles/theme.css` 中声明（浅色在 `:root`，深色在 `.dark`），通过 `@theme inline` 暴露为 Tailwind 颜色（如 `bg-surface`、`text-brand-text`），并映射到 shadcn/ui 使用的变量。

### Color

| Token                              | Light                 | Dark                  | 用途                               |
| ---------------------------------- | --------------------- | --------------------- | ---------------------------------- |
| `background`                       | `#FFFFFF`             | `#111318`             | 页面背景                           |
| `surface`                          | `#F7F6F3`             | `#191B20`             | 次级区域（Credits 卡片、展示面板） |
| `surface-strong`                   | `#EFEDE8`             | `#23262D`             | 占位、头像底色、中性徽章           |
| `border`                           | `#E6E3DD`             | `#2A2D35`             | 分隔线、卡片描边                   |
| `border-strong`                    | `#D4D0C8`             | `#3A3E47`             | 输入框、Secondary 按钮描边         |
| `foreground`                       | `#111318`             | `#F4F3EF`             | 主文字                             |
| `muted-foreground`                 | `#5E626B`             | `#A3A7AF`             | 次要文字、标签                     |
| `subtle-foreground`                | `#8A8E96`             | `#80848D`             | 占位符、计数器、脚注               |
| `primary`                          | `#111318`             | `#F4F3EF`             | 主按钮底色                         |
| `primary-hover`                    | `#2A2D35`             | `#DCDAD4`             | 主按钮悬停                         |
| `primary-foreground`               | `#FFFFFF`             | `#111318`             | 主按钮文字                         |
| `brand`                            | `#6D4AFF`             | `#6D4AFF`             | Logo、Credits 图标、焦点环         |
| `brand-soft`                       | `#EFEBFF`             | `#221A45`             | 品牌色浅底（标签）                 |
| `brand-text`                       | `#5332E0`             | `#A996FF`             | `background` 上的品牌色文字        |
| `brand-foreground`                 | `#FFFFFF`             | `#FFFFFF`             | `brand` 底色上的文字               |
| `success` / `success-soft`         | `#15803D` / `#E8F6EC` | `#4ADE80` / `#12291B` | 成功、已付款、Save 标签            |
| `info` / `info-soft`               | `#2457D6` / `#EAF0FD` | `#7FA6FF` / `#17223D` | 处理中、等待到账                   |
| `warning` / `warning-soft`         | `#A35A00` / `#FFF4DF` | `#F5B544` / `#2E2210` | 提醒（如到账超时）                 |
| `destructive` / `destructive-soft` | `#C42B1C` / `#FDECEA` | `#FF7A6B` / `#36171A` | 失败、错误                         |
| `overlay`                          | `#111318CC`           | `#111318CC`           | 媒体上的遮罩                       |

对比度规则：

- 品牌色文字一律用 `brand-text`，不用 `brand`（浅色模式下对比度不足）；`brand` 底色上只放 `brand-foreground`。
- 状态色文字只放在 `background` 或对应的 `*-soft` 底上。
- 除 `subtle-foreground` 外，两套主题的文字组合都满足 WCAG AA（≥ 4.5:1）。`subtle-foreground` 在浅色模式下只有 3.3:1，只用于占位符、计数器、脚注，不用于必须阅读的内容。

与 shadcn/ui 的映射：shadcn 的 `--accent` 指悬停背景，映射到 `surface-strong`；品牌色使用独立的 `--brand*` 变量，不占用 `--accent`。`--ring` 映射到 `brand`。

### Theming

- 代码中用 `next-themes`（`attribute="class"`）切换 `<html>` 上的 `.dark` class，可选 System / Light / Dark，默认 System（跟随 `prefers-color-scheme`）。偏好只存在浏览器本地，不写数据库。
- `brand`、`brand-foreground`、`overlay` 两套主题取值相同，`.dark` 中不重复声明。
- 设计文件中颜色变量带 light / dark 主题轴。深色画板复制自对应浅色画板，只切换主题；没有单独画的深色页面按 token 自动得到。
- 叠在媒体上的控件和遮罩（白色图标、`overlay`）两套主题相同，不受页面背景影响。用户上传或生成的内容不做深色处理。

### Typography

| 角色    | 字体                | 字号 / 字重                      |
| ------- | ------------------- | -------------------------------- |
| Display | Bricolage Grotesque | 56 / 700，letter-spacing −1.6    |
| H1      | Bricolage Grotesque | 36 / 700（移动端 28）            |
| H2      | Bricolage Grotesque | 24 / 600（移动端 20）            |
| H3      | Inter               | 18 / 600                         |
| Body    | Inter               | 15 / 400，line-height 1.5        |
| Small   | Inter               | 13 / 500                         |
| Caption | Inter               | 12 / 600，大写，letter-spacing 1 |

- 中文回退字体：`Noto Sans SC`、`PingFang SC`（Inter 和 Bricolage Grotesque 都不含中文字形）。
- 数字（Credits、价格）使用 tabular figures（`tabular-nums`）。
- 字体通过 `next/font/google` 加载；标题用 `font-heading`，正文用默认的 `font-sans`。
- Bricolage Grotesque 加载 `opsz` 轴，所有字号固定用 `opsz 96`。不固定时浏览器按字号自动选择，标题会比设计稿宽。

### Radius

| Token         | 值  | 用途                      |
| ------------- | --- | ------------------------- |
| `radius-sm`   | 6   | 小元素                    |
| `radius-md`   | 10  | 按钮、输入框、选项、Alert |
| `radius-lg`   | 16  | 卡片、媒体、面板          |
| `radius-pill` | 999 | 徽章、Credits pill、头像  |

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

基础组件在 `packages/ui/src/components/`（shadcn/ui 风格，已改为使用上方 token）。新组件优先从这里组合；需要新的基础组件时，先画进设计文件，再加到这里和下表。

| 组件                                  | 代码实现                        | 说明                                                                                                                    |
| ------------------------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `Button/Primary`                      | `Button` default                | 每个区块的主操作                                                                                                        |
| `Button/Secondary`                    | `Button` outline                | 次要操作（Buy credits、Load more）                                                                                      |
| `Button/Ghost`                        | `Button` ghost                  | 取消、行内操作、页脚的语言和主题切换                                                                                    |
| `Button/Large`                        | `Button` + `h-12 px-6`          | 页面级主操作：Landing CTA、Run                                                                                          |
| `Dropdown Menu`                       | `DropdownMenu`                  | 用户菜单、语言和主题选择（单选项）                                                                                      |
| `Sheet`                               | `Sheet`                         | 移动端菜单抽屉                                                                                                          |
| `Popover`                             | `Popover`                       | 已提供，Starter 页面暂未使用                                                                                            |
| `Toggle Group`                        | `ToggleGroup` / `Toggle`        | 已提供，Starter 页面暂未使用；用于互斥选项                                                                              |
| `Credits Pill`                        | 自定义（`app-nav.tsx`）         | 导航栏中的余额，`surface` 底 + `border` 描边，`brand` 色 `coins` 图标，链接到 Billing                                   |
| `Top Nav` / `Mobile Top Bar`          | `AppNav`                        | 当前页链接加粗 + 2px 下划线；右侧常驻余额和头像（移动端为菜单按钮）                                                     |
| `Marketing Nav`                       | `MarketingNav`                  | 公开页面顶栏；链接 14 / 500 `muted-foreground`，当前页 600 `foreground`                                                 |
| `Status Badge`                        | 自定义（`purchase-status.tsx`） | 高 24、`rounded-full`、12 / 600 大写，图标 14；颜色见 [Status](#status)                                                 |
| `Alert`                               | 自定义（`checkout-status.tsx`） | `*-soft` 底、`radius-md`、padding 16，左侧 18px 状态图标，标题 14 / 600 + 说明 13 `muted-foreground`                    |
| `Pricing Card`                        | 自定义（`pricing-plans.tsx`）   | 推荐 Pack 描边加粗为 `primary` 2px，显示 `brand-soft` 的 Most popular 标签；Pack 加 `success-soft` 的 Save 标签         |
| `Plan Card`                           | 自定义（`pricing-plans.tsx`）   | 订阅方案整行卡片，`/Desktop` 横排、`/Mobile` 单列；样式同非推荐 Pack，`brand-soft` 的 Subscription 标签，按钮为 outline |
| `Cookie Banner`                       | 自定义（`cookie-banner.tsx`）   | 固定在底部，`background` 底 + `border` 描边，Decline（outline）+ Accept（default）                                      |
| `Status Page`                         | 自定义（`status-page.tsx`）     | 404 与错误页，见下方页面说明                                                                                            |
| `Media/Image`                         | 未实现                          | 结果图片，`radius-lg`，裁切填满；悬停时右上角显示 `overlay` 圆形下载按钮（白色图标）                                    |
| `Media/Video` / `Media/Video Playing` | 未实现                          | 16:9 视频；暂停时居中 56px 播放按钮 + 右下角时长；播放时底部为控制条（`overlay` 底，白色图标和文字）                    |
| `Media/Running` / `Media/Failed`      | 未实现                          | 与结果同尺寸的占位：处理中为 `loader-circle`（`info`，旋转）；失败为 `circle-x`（`destructive`）+ Credits 已退回        |
| `Media/Thumbnail`                     | 未实现                          | 72px 缩略图，`radius-md`，右上角为移除按钮                                                                              |
| `Upload/Dropzone`                     | 未实现                          | 上传区，`surface` 底 + `border-strong` 描边；提示 JPG、PNG、WebP，最大 10 MB（与上传限制一致）                          |
| `Upload/Progress`                     | 未实现                          | 上传中的文件：预览、文件名、`primary` 进度条、百分比、取消按钮                                                          |

---

## Status

任务状态（示例 Task，`messages` 的 `status`）在结果列表中只显示文字，不用徽章：

| 状态      | 文案      | 显示内容                   |
| --------- | --------- | -------------------------- |
| PENDING   | Running   | 输入                       |
| SUCCEEDED | Succeeded | 结果                       |
| FAILED    | Failed    | 失败说明（Credits 已退回） |

产品需要状态徽章时，使用下方 Purchase 的同一套样式：处理中用 `info-soft` / `info` + 旋转的 `loader-circle`，成功用 `success-soft` / `success` + `circle-check`，失败用 `destructive-soft` / `destructive` + `circle-x`。

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

- `Logo/Full`：标记 + 品牌名（`meta.title`，Bricolage Grotesque 700），用于桌面端导航、Landing、页脚。
- `Logo/Icon`：只有标记，用于移动端应用顶栏（品牌名保留为 `sr-only`）。

App Icon / favicon（`apps/web/src/app/icon.svg`、`apps/web/src/app/apple-icon.png`、`apps/web/src/app/favicon.ico`）固定为 `#111318` 底、`#6D4AFF` 折线、白色圆点，不随主题变化；PNG 和 ICO 由 `icon.svg` 渲染（180 / 48 / 32 / 16 px）。Open Graph 图（`apps/web/src/app/opengraph-image.tsx`）使用同样的两条 path。换标记时这几处一起改。

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
