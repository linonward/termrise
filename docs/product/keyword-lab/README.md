# keyword-lab（已归档）

keyword-lab 是维护者在 Termrise 之前用的选词仓库（`linonward/keyword-lab`，2026-10-31 归档）：两套 SOP 和几个命令行脚本，由 Claude 按 SOP 跑。它的规则已经移进词库（[keyword-pool.md](../keyword-pool.md)），数据已经导入（`pnpm pool:import`）。这里保留原文，作为规则的来源和历史：

- [evergreen-sop.md](evergreen-sop.md)：长青选词 SOP。规则 `tool-site-v1` 来自它的第 2 节，词源来自 4.0，复查来自 4.10，修订记录在第 8 节。
- [hot-sop.md](hot-sop.md)：热词 SOP。新词（`newword-v1`）取代了它的发现和判断部分。
- [briefs/](briefs/)：keyword-lab 写的选词简报。

文中的命令（`node …/dfs.ts` 等）是 keyword-lab 的脚本，在 Termrise 中不能运行；对应的功能见 keyword-pool.md。
