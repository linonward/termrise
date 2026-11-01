# Trend Sources

新词和热词从哪里来、哪些开源项目值得借鉴（维护者 2026-11-01 要求：数据要全、要早，从全网更早发现新词）。下面的项目和接口是 2026-11-01 调研的结果：星数和最近提交时间取自 GitHub API，接口都实际请求过；标"未核实"的没有实测。Termrise 已经接入的写在 [keyword-pool.md](keyword-pool.md#new-words)。

## 已接入

| 来源                                                                 | 方式                                                   | 频率      | 费用                      |
| -------------------------------------------------------------------- | ------------------------------------------------------ | --------- | ------------------------- |
| Google Trends 飙升查询（约 110 个根词轮换）                          | DataForSEO `google_trends/explore`，一次一个根词       | 每天一次  | 每个根词 0.011 美元       |
| Google Trends Trending Now（美国，去掉体育、政治、法律、娱乐、天气） | `google-trends-now`（Google 页面数据，失败时退回 RSS） | 每 3 小时 | 免费                      |
| 根词的谷歌自动补全，新出现的建议                                     | `suggestqueries.google.com`，和上次比                  | 每 3 小时 | 免费，按 IP 限频          |
| Hugging Face 热门模型                                                | `huggingface.co/api/models?sort=trendingScore`         | 每 3 小时 | 免费                      |
| itch.io 新游戏                                                       | `itch.io/games/new-and-popular.xml`                    | 每 3 小时 | 免费                      |
| Show HN 新产品（S75）                                                | `hn.algolia.com/api/v1/search_by_date?tags=show_hn`    | 每 3 小时 | 免费                      |
| Product Hunt 新产品（S75）                                           | 官方 GraphQL API v2，`PRODUCT_HUNT_TOKEN`              | 每 3 小时 | 免费；商用需和他们联系    |
| 起因证据：Hacker News、Hugging Face、GitHub，Claude 网页搜索         | 见 keyword-pool.md#origins                             | 每轮追溯  | 网页搜索约 0.034 美元一次 |

## 开源项目

### Google Trends 采集

| 项目                                                                                                                                                  | 内容                                                                                              | 状态                                     | 结论                                                                      |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------- |
| [RuochenLyu/google-trends-now](https://github.com/RuochenLyu/google-trends-now)（12★，2026-07）                                                       | Trending Now：Google 内部 batchexecute 接口，失败退回 RSS；给搜索量、涨幅、开始结束时间、相关查询 | 小而新，Node，无依赖                     | **已采用**（S73）                                                         |
| [flack0x/trendspyg](https://github.com/flack0x/trendspyg)（61★，2026-10）                                                                             | Trending Now RSS 和 CSV（约 480 条/国家，需要 Chrome）、Explore 的飙升和 Breakout 查询            | 活跃，Python                             | 要另起 Python 服务；Explore 约 15 分钟 8 到 10 次后 429（README，未核实） |
| [fdciabdul/Google-Trends-Keywords-Scraper](https://github.com/fdciabdul/Google-Trends-Keywords-Scraper)（158★，2026-10）                              | 约 125 个国家的 RSS，GitHub Actions 每小时跑                                                      | 活跃                                     | 多国 RSS 轮询的参考                                                       |
| [yiromo/pytrends-modern](https://github.com/yiromo/pytrends-modern)（74★）、[akvise/trends-checker](https://github.com/akvise/trends-checker)（399★） | pytrends 的后继，处理 cookie 和限频                                                               | 活跃，Python                             | 可以替代 DataForSEO 的飙升查询，但同样会 429                              |
| [GeneralMills/pytrends](https://github.com/GeneralMills/pytrends)（3,729★）                                                                           | 老牌 Trends 库                                                                                    | **已归档**（2024-08），trending 接口 404 | 不用                                                                      |
| [pat310/google-trends-api](https://github.com/pat310/google-trends-api)（975★，2022）                                                                 | Node 封装                                                                                         | 很久没更新，大概率失效（未核实）         | 不用                                                                      |
| [yan-labs/yan-skills](https://github.com/yan-labs/yan-skills)（227★，2026-10）                                                                        | 独立开发者的选词流程：浏览器取 Trends、Google/Bing/DDG 建议、gpts 基线                            | 活跃                                     | 思路和 Termrise 一样，阈值可参考 `references/trends.md`                   |

Google 官方 Trends API 自 2025-07 起是白名单内测，2026 年仍是内测（第三方文章），能否取飙升查询未核实。

### 发现管道和聚合器

| 项目                                                                                    | 内容                                                           | 结论                                               |
| --------------------------------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------- |
| [sansan0/TrendRadar](https://github.com/sansan0/TrendRadar)（63,330★，2026-10，Python） | 约 35 个平台热榜，按关键词过滤，推送，带 MCP 和 AI 分析        | 偏国内平台；"采集 → 过滤 → 推送"的结构是最好的参考 |
| [newsnext/newsnow](https://github.com/newsnext/newsnow)（22,196★，2026-10，TypeScript） | 热榜聚合，每个来源一个适配器                                   | 来源适配器的写法适合 Node worker                   |
| [replicate/hype](https://github.com/replicate/hype)（259★，2026-02，TypeScript）        | 把 GitHub、Hugging Face、Replicate、Reddit 合成一个 AI 热度流  | 最接近我们找 AI 模型名的做法                       |
| [DIYgod/RSSHub](https://github.com/DIYgod/RSSHub)（46,739★，2026-10）                   | 大量网站的 RSS 路由（GitHub Trending、Product Hunt、Steam 等） | 自己部署一份，可以当统一的 RSS 层                  |

### 爆发检测

- [nmarinsek/burst_detection](https://github.com/nmarinsek/burst_detection)（78★，2018，Python）：Kleinberg 爆发检测，代码很短，可以移植。
- [hitsujiwool/node-kleinberg-burst](https://github.com/hitsujiwool/node-kleinberg-burst)（1★，2015）：JavaScript 版，只作参考。
- 以我们的量级，每个词按来源算"今天的量 ÷ 过去的中位数"（z 分数）就够了，Kleinberg 没必要。
- 开源的 "Exploding Topics" 仿品都是 0 到 1 星的玩具项目。

## 还没接的免费来源

| 来源                               | 地址                                                                                                       | 情况                                                                 |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| DuckDuckGo 建议                    | `duckduckgo.com/ac/?q=…&type=list`                                                                         | 200，可以和谷歌建议交叉验证                                          |
| Hugging Face Spaces、Datasets 热门 | `/api/spaces`、`/api/datasets?sort=trendingScore`                                                          | 200；Spaces 名字杂，要过滤                                           |
| Wikipedia 每日热门文章             | `wikimedia.org/api/rest_v1/metrics/pageviews/top/en.wikipedia/all-access/YYYY/MM/DD`、`top-per-country/US` | 200，晚一天；要设 User-Agent                                         |
| Wikipedia 新建词条（实时）         | `stream.wikimedia.org/v2/stream/page-create`（SSE）                                                        | 未核实                                                               |
| Roblox Explore                     | `apis.roblox.com/explore-api/v1/get-sorts`                                                                 | 200，未公开的接口，随时可能变                                        |
| Steam 最多人玩                     | `api.steampowered.com/ISteamChartsService/GetMostPlayedGames/v1/`                                          | 200，带上周排名，可以算涨幅                                          |
| Product Hunt                       | `producthunt.com/feed`                                                                                     | 200，RSS                                                             |
| GitHub Trending                    | `github.com/trending`                                                                                      | 只有 HTML，要解析                                                    |
| Reddit                             | `/subreddits/new.json` 等                                                                                  | 不登录 403，要 OAuth 应用（约 100 次/分钟，未核实）                  |
| YouTube 热门                       | YouTube Data API `videos.list?chart=mostPopular&regionCode=US`                                             | 每次 1 个配额单位，每天免费 10,000；官方；标题里常有游戏、梗和产品名 |

## X 和 TikTok

2026-11-01 调研，价格和接口变动快，接入前再核对一次。

**X**：官方 API 现在按次付费（[价格页](https://docs.x.com/x-api/getting-started/pricing)，页面没有日期）：先充值，每次请求扣费。

- 热门话题 `GET /2/trends/by/woeid/23424977`（美国，`max_trends` 最多 50）每次 0.01 美元，返回话题名和帖子数；每个应用每 15 分钟限 75 次。每 3 小时取一次，一个月约 **2.4 美元**。
- 帖子数统计 Counts: Recent 每次 0.005 美元，可以给候选词看涨势，每天 20 个约每月 3 美元。
- 不要用搜索拉帖子正文（100 条 0.5 美元），也不要用要你登录 X 或给 cookie 的工具（违反 X 条款，账号有风险）。第三方转售商（TwitterAPI.io 等）多半靠抓取，现在官方已经一样便宜，没必要。
- 旧的 Free、Basic、Pro 档位据第三方文章已在 2026 年并入按次付费（未核实）。

**TikTok**：没有适合个人商业开发者的官方趋势接口。

- Research API 只给学术和非营利；Commercial Content API 只有欧盟广告；Display API 只能看登录用户自己的内容。
- Creative Center 的趋势页要登录，旧的匿名 JSON 接口已返回 40101；不登录时每个分类只看到 3 个话题标签。据 Apify 上的一个抓取器说明，TikTok 在 2026-07-21 关掉了 Creative Center 的接口，换成 TikTok One 的趋势接口（未找到官方说明）。
- 可用的是 Apify 上的抓取器，例如 [webdata_labs/tiktok-hashtag-trends-scraper](https://apify.com/webdata_labs/tiktok-hashtag-trends-scraper)：每 1,000 行 2 美元，不需要 TikTok 账号，给排名、播放量、帖子数、热度曲线。美国、7 天榜、约 18 个行业，每天跑一次约 54 行，每月约 **3 美元**。榜单按 7 天算，每 3 小时跑（约 26 美元/月）意义不大。
- 风险：这是抓取未登录的公开页面，条款风险中等（主要由抓取器运营方承担），维护风险高（2026 年接口已改过多次），要对空结果报警。
- 开源项目很弱：davidteather/TikTok-Api（约 6.7k★，2026-08）要浏览器和 msToken，拿的是普通推荐流，不是趋势；drawrowfly/tiktok-scraper 2023 年后没更新；Creative Center 相关仓库都只有 0 到 1 星。EnsembleData 一类的数据商每月 100 美元起。

**建议**（每月 30 美元以内）：

1. 先接 X 官方热门话题，每 3 小时一次，约 2.4 美元/月；候选词再用 Counts: Recent 看涨势，约 3 美元/月。正规、便宜、词干净。
2. TikTok 话题标签用上面的 Apify 抓取器，每天一次，约 3 美元/月；只存话题标签，空结果时报警，当作附加来源。
3. YouTube 热门（免费，官方），部分替代 TikTok 和 Shorts 的信号。
