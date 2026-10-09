# seo-keyword-matrix evals

检查带 Skill 的 Agent 是否做对了事。脚本算得对不对由 `scripts/*.test.mjs` 检查，不在这里。

| Eval                     | 初始状态                                                 | 检查什么                                                                                  |
| ------------------------ | -------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `matrix-from-exports`    | 虚构产品 Clipo，空的 `seo/`，Ahrefs 导出 + SERP 导出     | 导入；按 SERP 重叠和意图聚类；拒绝 Scope 外的词；竞品词保持 candidate；选第一批前停下来问 |
| `briefs-for-first-batch` | Clipo 的矩阵（`files/clipo/matrix.json`）                | Brief 按模板写；事实有来源；不改其他 Cluster                                              |
| `search-console-review`  | Starter 自带的 `seo/`，Search Console「查询 × 页面」导出 | 找出蚕食和排名 8–20 的页面；导入新查询词；改页面前先问                                    |

`files/clipo/expected.json` 是第一个 eval 的标准答案：哪些词在一起、哪些分开、哪些被拒绝。SERP 导出是构造的：同组的词前 10 个 URL 有 6 个以上相同；容易混淆的组（工具页和「best …」榜单、通用教程和 Etsy 教程）最多 2 个相同。

## 运行

先提交：每次运行都把 `HEAD` 检出到一个临时 git worktree。

```bash
node .claude/skills/seo-keyword-matrix/evals/run.mjs                 # 全部 eval，带 Skill
node .claude/skills/seo-keyword-matrix/evals/run.mjs --baseline      # 同时跑不带 Skill 的对照组
node .claude/skills/seo-keyword-matrix/evals/run.mjs --eval search-console-review --keep
```

每次运行调用 `claude -p`，费用记在当前登录的账号上。Agent 只能编辑 worktree 中的文件，只能运行 `ALLOWED_TOOLS` 中的命令。结果写到 `.claude/skills/seo-keyword-matrix-workspace/iteration-<n>/`（已 gitignore）。

## 评分

1. 每次运行（`<config>/run-1/`）的 `grading.json` 是 `grade.mjs` 的脚本检查：文件状态、`pnpm seo:validate`、是否只改了 `seo/`。
2. `evals.json` 的 `expectations` 检查回复内容和用了哪些脚本。根据 `transcript.jsonl` 和 `outputs/reply.md` 评分（用 skill-creator 的 `agents/grader.md`，或人工），结果追加到 `grading.json` 的 `expectations`，并更新 `summary`。
3. 用 skill-creator 的 `python -m scripts.aggregate_benchmark <workspace>/iteration-<n> --skill-name seo-keyword-matrix` 汇总，对比 `with_skill` 和 `without_skill`，再用 skill-creator 的 `eval-viewer/generate_review.py <workspace>/iteration-<n>` 查看输出。

`trigger.json` 是「应该触发 / 不应该触发」的查询，供 skill-creator 优化 description 使用（`scripts/run_loop.py --eval-set`）。
