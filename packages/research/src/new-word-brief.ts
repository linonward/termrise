// The brief of a selected new word (docs/product/keyword-pool.md#brief): what a new word
// is, why it was judged worth a page and what is known about its results. Saved data only.
import type { newWordRoots } from "@repo/db/schema";

import type { NewWord } from "./new-words";

const num = (n: number | null | undefined) =>
  n == null ? "—" : n.toLocaleString("en-US");

export const newWordBriefFileName = (w: Pick<NewWord, "phrase">) =>
  `keyword-brief-${w.phrase.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.md`;

export function buildNewWordBrief(
  w: NewWord,
  roots: (typeof newWordRoots.$inferSelect)[],
  children: NewWord[],
) {
  const serp = (w.serp ?? []) as {
    rank: number;
    site: string;
    title: string;
  }[];
  const newSites = (w.newSites ?? []) as {
    domain: string;
    registeredOn: string;
  }[];
  const verdict =
    { worth: "值得做", try: "可以试试", skip: "不建议" }[w.verdict ?? "skip"] ??
    "—";
  const build =
    w.buildAs === "new_site"
      ? "新站首页"
      : w.buildAs === "inner_page"
        ? "做内页"
        : "—";
  return [
    `# 选词简报：${w.phrase}（新词）`,
    "",
    `选定日期：${w.selectedAt?.toISOString().slice(0, 10) ?? "—"} · 来源：Termrise 新词（规则 ${w.rules ?? "newword-v1"}）· 冒出来的根词：${roots.map((r) => r.root).join("、") || "—"}`,
    "",
    "## 结论",
    "",
    `${verdict}，${build}。新词的热度会变：上线前再看一次走势。`,
    "",
    "## 这是什么",
    "",
    `- 这是什么：${w.about ?? "—"}`,
    `- 用户想要什么：${w.userWants ?? "—"}`,
    `- 我们要怎么做：${w.plan ?? "—"}`,
    "",
    `## 数据（来源：DataForSEO，${w.checkedAt?.toISOString().slice(0, 10) ?? "—"}）`,
    "",
    "| 项 | 值 |",
    "| --- | --- |",
    `| 热度（GPTs 倍数） | ${w.ratio == null ? "—" : `×${w.ratio.toFixed(3)}`}（${w.ratioDay ?? "—"}） |`,
    `| 首次出现 | ${w.firstSeenAt.toISOString().slice(0, 10)} |`,
    `| 爆发日 / 峰值日 | ${w.burstDay ?? "—"} / ${w.peakDay ?? "—"} |`,
    `| 月搜索量（美国） | ${num(w.searchVolume)} |`,
    `| KD | ${w.keywordDifficulty ?? "—"} |`,
    `| 前两页专门页面 | ${w.dedicatedPages ?? "—"} |`,
    "",
    "## 可以做成内页的长尾",
    "",
    ...(children.length
      ? children.map((c) => `- ${c.phrase}`)
      : ["还没有扫到。"]),
    "",
    "## 前 10 名",
    "",
    ...(serp.length
      ? serp
          .slice(0, 10)
          .map(
            (r) =>
              `${r.rank}. ${r.title.replace(/[\r\n]+/g, " ")}（${r.site}）`,
          )
      : ["还没有查过。"]),
    "",
    "## 谷歌首页新站",
    "",
    ...(newSites.length
      ? newSites.map((s) => `- ${s.domain}（${s.registeredOn} 注册）`)
      : ["没有。"]),
    "",
  ].join("\n");
}
