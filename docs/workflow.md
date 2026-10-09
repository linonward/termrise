# Workflow

## Delivery Workflow — Vertical Slice + PR

### 原则

```text
1 Slice = 1 Branch = 1 PR
```

每个 Slice 必须是 **纵向切片**：

```text
从 UI / API 入口
↓
Service
↓
Database / Provider
↓
可观察的结果
```

一次交付一个用户可感知或可验证的行为，而不是按层（先全部 schema，再全部 service，再全部 UI）交付。

Spike / 基础设施类 Slice 例外，但必须有可运行的验证（脚本或测试）。

---

### Branch & Worktree

```text
main 永远可部署，禁止直接 push

禁止在 main 上修改或提交
```

主仓库目录 `<repo>/` 只停留在 `main`，只用于 `git pull` 和创建 worktree，不在其中编辑文件。`<repo>` 为产品仓库名。

每个 Slice 在独立的 git worktree 中开发，worktree 与主仓库目录同级：

```text
<repo>/                  ← main（只读）
<repo>-billing/          ← slice/03-billing
<repo>-dashboard/        ← slice/04-dashboard
```

命名：

```text
Branch:   slice/{nn}-{topic}
Worktree: ../<repo>-{topic}
```

开始任务前，先同步远端 `main`，再从最新的 `main` 创建 worktree：

```bash
cd <repo>
git fetch origin
git pull --ff-only
git worktree add ../<repo>-{topic} -b slice/{nn}-{topic} main
cd ../<repo>-{topic}
pnpm install
```

`pnpm install` 同时通过 `prepare` 脚本安装 Git hooks（husky）。没有执行这一步，hooks 不会生效，提交也就不会经过 lint-staged 和 commitlint。

只有需要手动部署 Preview 或拉取 Vercel 环境变量时，才在该 worktree 的 `apps/web` 目录中执行 `vercel link --project <repo> --yes`。它会生成 `apps/web/.vercel/` 和 `apps/web/.env.local`（都已 gitignore），并覆盖已有的 `.env.local`。worktree 删除后，`node_modules`、`.vercel/`、`.env.local` 都随之消失，新 worktree 要重新执行。

`git pull --ff-only` 失败说明本地 `main` 有不该存在的改动，停下来排查，不要强行合并。

在已有 worktree 中继续工作前，同样先同步并 rebase 到最新的 `main`：

```bash
git fetch origin
git rebase origin/main
```

每个 worktree 配套独立的开发数据库：

```text
1. 从 Neon main 创建分支 dev/{topic}（Neon CLI 或控制台）
2. 在新 worktree 中创建 apps/web/.env.local（不提交），DATABASE_URL 指向 dev/{topic}
3. 运行 migration
```

`apps/web/.env.local` 不会随 worktree 自动复制，需要从已有 worktree 拷贝后修改。每个 worktree 的 `TEST_DATABASE_URL` 使用不同的库名，见 [testing.md](architecture/testing.md)。

PR 合并后，立即清理 worktree 并同步本地 `main`，保持 `main` 为最新状态：

```bash
cd <repo>
git worktree remove ../<repo>-{topic}
git branch -D slice/{nn}-{topic}
git push origin --delete slice/{nn}-{topic}
git fetch origin --prune
git pull --ff-only
```

- 先用 `gh pr view` 确认 PR 状态为 MERGED，再删除分支。Squash Merge 后分支不是 `main` 的祖先，`git branch -d` 会拒绝删除，所以用 `-D`。
- 同时删除 Neon 分支 `dev/{topic}`。

依赖尚未合并的 Slice 时，从该 Slice 的分支创建 worktree，PR base 指向该分支。前序 PR 合并后，先把 PR base 改为 `main`，再删除前序分支（删除 base 分支会关闭依赖它的 PR）。然后只保留本 Slice 自己的 commit：

```bash
git fetch origin
git rebase --onto origin/main {前序分支合并前的 HEAD} slice/{nn}-{topic}
git push --force-with-lease
```

---

### Commit

Conventional Commits，由 `commit-msg` hook（commitlint）强制校验：

```text
feat: / fix: / test: / docs: / style: / refactor: / perf: / build: / ci: / chore: / revert:
```

提交时 `pre-commit` hook 自动对暂存文件执行 lint + format，见 [Code Quality](architecture/overview.md#code-quality)。禁止使用 `--no-verify` 跳过 hooks。

Slice 内可以有多个 commit（推荐：先 test commit，再 feat commit，体现 TDD）。

Commit message 末尾附：

```text
Co-Authored-By: ...
```

（按当前 Agent 的署名规则。）

---

### Pull Request

PR 标题使用 Conventional Commits 格式。Slice PR 把 Slice 编号写在 scope 中：

```text
{type}(S{nn}): {Slice 名称}     ← Slice PR，例如 feat(S06a): 订阅退款扣回（后端）
{type}: {描述}                  ← 其他 PR，例如 docs: document Resend setup
```

Squash Merge 把 PR 标题作为 `main` 上的 commit message，但 GitHub 上合并时不运行本地的 `commit-msg` hook。所以 `PR Title` workflow 用同一份 commitlint 配置检查 PR 标题。检查失败时，修改 PR 标题即可，workflow 会重新运行。

PR 描述模板：

```text
## Slice
S{nn} — 名称

## Doc References
相对链接 + 标题锚点

## Acceptance Criteria
- [ ] ...

## Tests
- Unit:
- Integration:
- E2E:

## Verification
命令输出 / Preview URL / 截图

## Out of Scope
本 PR 明确不做的事情
```

合并条件：

```text
CI 全绿（lint / format / typecheck / test / build / e2e / PR title），并且最新一次提交的 CI 已经跑完

Acceptance Criteria 全部勾选

需要公网回调的 Slice（OAuth、支付 webhook 等）：附手动 Preview 或 Tunnel 的验证记录

人工 Review 通过

含 migration 的 PR：合并前已对 Production 数据库执行 migration
```

Production migration 的执行方式见 [deployment.md](architecture/deployment.md#migrations)。

合并方式：

```text
Squash Merge
```

仓库为 GitHub Free 的 private 仓库时，没有分支保护，Actions 分钟数有限。下面的规则由合并的人自己遵守，GitHub 不会拦截：

| 规则                          | 设置                                                                                              |
| ----------------------------- | ------------------------------------------------------------------------------------------------- |
| 合并前必须通过的检查          | `Lint · Format · Typecheck · Test · Build`、`E2E (Playwright)`、`PR Title (commitlint)`           |
| 合并前分支必须基于最新 `main` | 是                                                                                                |
| 只能通过 PR 合并              | 是（不要求审批人数）                                                                              |
| force push / 删除 `main`      | 禁止                                                                                              |
| CI 触发                       | 只在 PR 上运行；合并后 `main` 不再运行。只改 `docs/**`、`*.md` 的 PR 不运行 CI，但运行 `PR Title` |

合并前先确认分支包含最新 `main`，再等待 CI 完成，然后合并：

```bash
git fetch origin && git merge-base --is-ancestor origin/main origin/{branch} \
  && gh pr checks {pr} --watch --fail-fast && gh pr merge {pr} --squash
```

- `merge-base` 失败说明分支落后于 `main`：在 worktree 中 `git rebase origin/main && git push --force-with-lease`，等 CI 重新跑完再合并。
- 刚 push 完、GitHub 还没登记检查时，`gh pr checks` 会报 no checks reported 并以非零退出码结束，稍后重跑即可。
- 只改文档的 PR 只运行 `PR Title (commitlint)`：确认分支包含最新 `main`、本地 `pnpm format:check` 通过、`gh pr checks {pr} --watch` 显示这个检查通过后，执行 `gh pr merge {pr} --squash`。

PR 规模：除 lockfile、migration 快照、生成文件外，diff 建议 < 400 行。超过则拆分 Slice。

### Dependency Checks

| 检查                                          | 何时运行                     | 失败时                                                                  |
| --------------------------------------------- | ---------------------------- | ----------------------------------------------------------------------- |
| CI 的 `Audit production dependencies`         | 每个 PR                      | 生产依赖有 high / critical 漏洞，PR 不能合并；npm registry 故障时不失败 |
| `Dependencies` workflow（`dependencies.yml`） | 每周一 01:17 UTC，或手动触发 | 全部依赖（含 dev）有 high / critical 漏洞；GitHub 邮件 + 飞书通知       |
| Dependabot（`.github/dependabot.yml`）        | 每月                         | 只更新 GitHub Actions，合并为一个 `ci: bump …` PR                       |

- `Dependencies` 也把 `pnpm outdated` 的结果写入运行的 Summary，不因为有过时的包而失败。
- 定时 workflow 只在 `main` 上运行。失败邮件发给最后修改 cron 那一行的人。public 仓库 60 天没有活动时，GitHub 自动停用定时 workflow。
- npm 依赖不用 Dependabot：Dependabot 只支持 pnpm v7–v10，本仓库使用 pnpm 12。按 runbook 的 Update Dependencies 手动更新。
- 飞书通知：在群里添加自定义机器人，把 webhook 地址存为仓库 Secret `FEISHU_WEBHOOK_URL`；机器人开了签名校验时，把密钥存为 `FEISHU_WEBHOOK_SECRET`；开了关键词校验时，关键词用仓库名（消息以 `[<owner>/<repo>]` 开头）。不设置 Secret 时只有邮件通知。webhook 地址是凭证，不写进代码、日志和对话。

  ```bash
  gh secret set FEISHU_WEBHOOK_URL
  gh secret set FEISHU_WEBHOOK_SECRET
  ```

  设置后验证：Actions → `Dependencies` → Run workflow，勾选 `test_notification`。这次运行只发一条测试消息，不做检查；群里收到消息、运行成功，说明 Secret 正确。

  ```bash
  gh workflow run Dependencies -f test_notification=true
  ```

---

## Agent Operating Rules

Agent（Codex、Claude 等）每个任务必须：

```text
Sync main + Create Worktree（见上文 Branch & Worktree，禁止在 main 上修改）
↓
Read 当前 Slice 相关文档（见 roadmap.md 的 Slice Plan）
↓
Identify Acceptance Criteria
↓
Write / Update Tests
↓
Implement Minimum Change
↓
Run Tests
↓
Run Typecheck
↓
Run Lint
↓
Verify
↓
Document Result
↓
Open PR
↓
PR 合并后：Cleanup Worktree + Sync main（见上文 Branch & Worktree）
```

禁止：

```text
Scope Expansion

Unrequested Refactor

New Framework

New Provider

Premature Abstraction

Large Dependency Introduction
```

遇到不确定的第三方 API：

```text
Waffo
Better Auth
R2
Resend
next-intl
Neon
新产品的 Task Provider
```

不得猜测 API。

必须根据当前官方文档确认。

文档与实际情况冲突时，停下来向用户说明冲突，请求人工确认，不得自行改变文档语义。

---

## Reply Style

Agent 回复用户时使用中文，并按 ASD-STE100（Simplified Technical English）的写作规则：

```text
一句话只说一件事；步骤句不超过 20 个字词，说明句不超过 25 个

指令用祈使句，一句一个动作；步骤用编号列表，按执行顺序排列

用主动语态，写清楚谁做什么

一个术语只表示一个意思，同一个东西始终用同一个词

不用成语、比喻、口语和模糊词（如“大概”“一些”）

一段不超过 6 句话

警告和前提条件写在对应步骤之前

代码、命令、文件名、标识符、错误信息保留原文
```

只约束 Agent 对用户的回复。文档、Commit、PR 的写法不变。
