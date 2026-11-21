// Which site template a chosen keyword is built on (docs/product/keyword-pool.md#brief,
// S87): tool-starter for something people do again and again (generate, convert,
// calculate), web-starter for something they want to play or learn (guides, tutorials,
// comparisons, collections), as vet-keyword's Gate 6 puts it. The brief says which and
// why; site-ops's `pnpm fleet:new <slug> --template <template>` starts the site.

export const SITE_TEMPLATES = ["tool-starter", "web-starter"] as const;
export type SiteTemplate = (typeof SITE_TEMPLATES)[number];

export type TemplateReason =
  | "pool_tool_rules"
  | "direction_tool"
  | "direction_content"
  | "long_tail"
  | "category_game"
  | "category_tool";

export type TemplateChoice = { template: SiteTemplate; reason: TemplateReason };

/** The reason as the brief writes it (Chinese, like the rest of the brief). */
export const TEMPLATE_REASON_TEXT: Record<TemplateReason, string> = {
  pool_tool_rules:
    "长青词按工具站规则选出，前 10 名里有工具页，用户要反复使用一个工具",
  direction_tool: "建站方向是在线工具或计算器，用户要反复做一件事",
  direction_content:
    "建站方向是教程、对比、替代品、模板库或合集，用户要了解或挑选",
  long_tail: "只做长尾：价格、对比、怎么用这类问题，是内容页",
  category_game: "没有建站方向；游戏类的词，用户要玩或了解，做攻略或导航",
  category_tool: "没有建站方向；AI 或工具类的词，按工具站做",
};

const TOOL_DIRECTIONS = new Set(["tool", "calculator"]);

/** Evergreen keywords: the pool's rules are a tool site's (H5, the intent check). */
export function templateForPoolKeyword(): TemplateChoice {
  return { template: "tool-starter", reason: "pool_tool_rules" };
}

/** A new word: its build direction first, then how it is built, then its category. */
export function templateForNewWord(w: {
  direction: string | null;
  buildAs: string | null;
  category: string | null;
}): TemplateChoice {
  if (w.buildAs === "long_tail")
    return { template: "web-starter", reason: "long_tail" };
  if (w.direction)
    return TOOL_DIRECTIONS.has(w.direction)
      ? { template: "tool-starter", reason: "direction_tool" }
      : { template: "web-starter", reason: "direction_content" };
  return w.category === "game"
    ? { template: "web-starter", reason: "category_game" }
    : { template: "tool-starter", reason: "category_tool" };
}

/** The brief's line on the template and the command that starts the site. */
export function templateLine(choice: TemplateChoice) {
  return `模板：**${choice.template}**（${TEMPLATE_REASON_TEXT[choice.reason]}）。建站：在 site-ops 跑 \`pnpm fleet:new <slug> --template ${choice.template}\`（slug 按 choose-domain 定）。要不要建站，以 vet-keyword 的结论为准。`;
}
