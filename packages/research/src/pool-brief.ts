// The keyword brief (docs/product/keyword-pool.md#brief): a chosen keyword handed to
// site-starter as docs/keyword-brief.md. Built from saved data only; anything not
// checked says so, never a guess.
import type { PoolCheck, PoolKeyword } from "./pool-service";
import type { TrendCheck } from "./pool-trend";
import { isHomepage } from "./serp-competition";
import { isDedicated } from "./serp-competition";

type SerpRow = {
  rank: number;
  site: string;
  url: string;
  title: string;
  traffic: number | null;
};

const pct = (x: number | null | undefined) =>
  x == null || !Number.isFinite(x)
    ? "—"
    : `${x > 0 ? "+" : ""}${Math.round(x * 100)}%`;
const num = (n: number | null | undefined) =>
  n == null ? "—" : n.toLocaleString("en-US");
const usd = (micros: number | null | undefined) =>
  micros == null ? "—" : `$${(micros / 1_000_000).toFixed(2)}`;
// One line of table text: no pipes or line breaks from saved data.
const cell = (text: string) => text.replace(/[|\r\n]+/g, " ").trim();

export const keywordBriefFileName = (k: Pick<PoolKeyword, "phrase">) =>
  `keyword-brief-${k.phrase.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.md`;

export function buildKeywordBrief(
  k: PoolKeyword,
  checks: PoolCheck[],
  today: string,
) {
  const deep = checks.find((c) => c.kind === "deep");
  const screen = checks.find((c) => c.kind === "screen");
  const deepData = (deep?.data ?? {}) as {
    serp?: { results?: SerpRow[]; strongSites?: string[] };
  };
  const kdRange =
    (screen?.data as { kdRange?: [number, number] | null } | undefined)
      ?.kdRange ?? null;
  const serp = deepData.serp?.results ?? [];
  const strong = new Set(deepData.serp?.strongSites ?? []);
  const trend = k.trend as TrendCheck | null;
  const selected = checks.find(
    (c) => c.kind === "review" && c.status === "selected",
  );
  const open: string[] = [];
  if (!k.monetization) open.push("变现（H4）还没回答");
  if (!k.compliance) open.push("合规（H7）还没回答");
  if (k.variantCount == null) open.push("变种数（S1）还没数");
  if (!deep) open.push("还没有深查（趋势、前 10 名）");
  if (!k.aiAngle) open.push("AI 改造点（S4）还没填写");

  const trendText =
    trend?.recentChange == null
      ? "—"
      : [
          `12 个月最高月比最低月 ${trend.ratio?.toFixed(2) ?? "—"}`,
          `近 12 个月比前 12 个月 ${pct(trend.yoy)}`,
          `最近 3 个月比去年同期 ${pct(trend.recentChange)}`,
          trend.baseline
            ? `种子词 ${trend.baseline.term} 同期 ${pct(trend.baseline.change)}，相对 ${pct(trend.relativeChange)}`
            : "没有基线",
        ].join("；");

  const lines = [
    `# 选词简报：${k.phrase}`,
    "",
    `${selected ? `选定日期：${selected.createdAt.toISOString().slice(0, 10)}` : `导出日期：${today}（状态：${k.status}）`} · 来源：Termrise 词库（规则 ${deep?.rules ?? screen?.rules ?? "tool-site-v1"}）· 词源：${k.sources.join("、") || "—"}`,
    "",
    "## 结论",
    "",
    k.status === "selected"
      ? "维护者已选定这个词：自动判断的硬性条件全部通过，变现和合规见下文。"
      : k.status === "candidate"
        ? "候选词：自动判断的硬性条件全部通过，还没有选定。"
        : `状态为 ${k.status}，不是候选词，交给建站前请先确认。`,
    "",
    `## 数据（来源：DataForSEO，${(deep ?? screen)?.createdAt.toISOString().slice(0, 10) ?? "—"}）`,
    "",
    "| 项 | 值 |",
    "| --- | --- |",
    `| 美国月搜索量 | ${num(k.searchVolume)} |`,
    `| KD | ${k.keywordDifficulty ?? "—"} |`,
    `| CPC | ${usd(k.cpcMicros)} |`,
    `| 月搜 ≥ 50 的变种数（S1） | ${num(k.variantCount)} |`,
    `| 趋势 | ${cell(trendText)} |`,
    `| 前 10 强对手数（H5） | ${k.strongCompetitors ?? "—"} |`,
    `| 前 10 内页数（S3） | ${k.innerPages ?? "—"} |`,
    "",
    "## 同义说法",
    "",
    k.variants.length === 0
      ? "没有数据完全相同的其他说法。"
      : [
          `下面的说法和主词的搜索量、CPC、曲线完全相同，是同一个需求${kdRange ? `（KD ${kdRange[0]} 到 ${kdRange[1]}）` : ""}：`,
          "",
          ...k.variants.map((v) => `- ${v}`),
        ].join("\n"),
    "",
    "## 联想词（用作关键词分析的种子）",
    "",
    "词库没有拉联想词。建站时用 analyze-keywords 从主词和上面的说法扩词。",
    "",
    "## 合规和变现",
    "",
    `- 变现方式：${k.monetization ?? "待确认"}`,
    `- 合规判断和依据：${k.compliance ?? "待确认"}`,
    "",
    "## 前 10 名",
    "",
    ...(serp.length === 0
      ? ["还没有查过前 10 名。"]
      : [
          "| 排名 | 网站 | 首页/内页 | 是否专门页面 | 强对手 |",
          "| --- | --- | --- | --- | --- |",
          ...serp.map(
            (r) =>
              `| ${r.rank} | ${cell(r.site)}${r.traffic != null ? `（月流量约 ${num(Math.round(r.traffic))}）` : ""} | ${isHomepage(r.url) ? "首页" : "内页"} | ${isDedicated(r.title, k.phrase) ? "是" : "否"} | ${strong.has(r.site) ? "是" : "否"} |`,
          ),
        ]),
    "",
    "## AI 改造点（S4）",
    "",
    k.aiAngle ?? "待填写。",
    "",
    "## 交给建站时要注意",
    "",
    ...(open.length > 0
      ? open.map((o) => `- ${o}`)
      : ["- 词库里的检查都已完成。"]),
    "- 数据有日期：上线前再看一次前 10 名。",
    "",
  ];
  return lines.join("\n");
}
