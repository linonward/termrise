import type { OpportunityDetailDto } from "./research-dto";
import { WEIGHTS } from "./scoring";

// The Product Brief: Markdown a coding agent can build from (docs/product/product.md#f07-决策与导出).
// English, built from stored data only: no AI call, no invented numbers. Sections the data
// cannot fill are left as checklists for the person to complete.

const NO_DATA = "no data";
const KEYWORDS_LISTED = 10;
const COMPETITORS_LISTED = 5;

const cell = (value: string) => value.replace(/\|/g, "\\|").replace(/\n/g, " ");
const line = (value: string) => value.replace(/\s*\n\s*/g, " ").trim();
const bullets = (items: string[], fallback: string) =>
  items.length === 0
    ? `- ${fallback}`
    : items.map((i) => `- ${line(i)}`).join("\n");
const date = (iso: string) => iso.slice(0, 10);
const usd = (value: number) => `$${value.toFixed(2)}`;
const hostname = (url: string) => {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
};

export function briefFileName(o: Pick<OpportunityDetailDto, "cluster">) {
  const slug = o.cluster
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `brief-${slug || "opportunity"}.md`;
}

export function buildBrief(o: OpportunityDetailDto): string {
  const a = o.analysis;
  const notAnalysed =
    "Not analysed: the AI analysis is missing for this evaluation.";
  const fixture =
    o.analystProvider === "fake" ||
    o.keywords.some((k) => k.provider === "fake");
  const keywords = o.keywords.slice(0, KEYWORDS_LISTED);
  const topSerp = o.serps[0];
  const latest = o.decisions[0];
  const mvp = a?.mvpScope ?? [];

  const sections: string[] = [
    `# Product Brief: ${line(o.cluster)}`,
    [
      `- Project: ${line(o.projectName)}`,
      `- Status: ${o.status}${latest ? ` (decided ${date(latest.createdAt)}: ${line(latest.reason)})` : ""}`,
      `- Opportunity score: ${o.score}/100 (scoring ${o.scoringVersion}); confidence ${o.confidence}%${o.needsReview ? "; needs review: high score on thin evidence" : ""}`,
      `- Evaluated: ${date(o.evaluatedAt)}`,
      "- The score ranks opportunities. It is not a chance of success.",
    ].join("\n"),
  ];
  if (fixture)
    sections.push(
      "> **Test data.** This brief comes from fake providers. Its metrics and analysis are not real market data.",
    );

  sections.push(
    "## Evidence",
    [
      "| Keyword | Volume | CPC | KD |",
      "| --- | ---: | ---: | ---: |",
      ...keywords.map(
        (k) =>
          `| ${cell(k.phrase)} | ${k.searchVolume ?? NO_DATA} | ${k.cpcUsd === null ? NO_DATA : usd(k.cpcUsd)} | ${k.keywordDifficulty ?? NO_DATA} |`,
      ),
    ].join("\n"),
    bullets(
      (Object.keys(WEIGHTS) as (keyof typeof WEIGHTS)[]).map(
        (d) => `${d}: ${o.dimensions[d]}/5 (weight ${WEIGHTS[d]})`,
      ),
      NO_DATA,
    ),
    "## User",
    a ? line(a.targetUser) : notAnalysed,
    "## Problem",
    a ? line(a.job) : notAnalysed,
    "## Competitors",
    bullets(a?.alternatives ?? [], "No alternatives named."),
    topSerp
      ? [
          `Top results for "${line(topSerp.phrase)}" (${topSerp.provider}, ${date(topSerp.fetchedAt)}):`,
          ...topSerp.results
            .slice(0, COMPETITORS_LISTED)
            .map((r) => `${r.rank}. ${line(r.title)} (${hostname(r.url)})`),
        ].join("\n")
      : "No search results were audited.",
    "## Differentiation",
    a ? line(a.differentiation) : notAnalysed,
    "## MVP Features",
    mvp.length === 0
      ? "- [ ] Define the smallest feature set that tests the problem."
      : mvp.map((f) => `- [ ] ${line(f)}`).join("\n"),
    "## Out of Scope",
    "- Everything not listed under MVP Features.\n- [ ] List the features to leave out on purpose.",
    "## Pages",
    [
      `- [ ] Landing page that targets "${line(keywords[0]?.phrase ?? o.cluster)}"`,
      "- [ ] The tool page for the first MVP feature",
      "- [ ] Pricing page for the pricing experiment",
    ].join("\n"),
    "## API",
    "- [ ] Define one endpoint per MVP feature: input, output, errors.",
    "## Data",
    "- [ ] Define the tables the MVP features need. Store no data that the features do not use.",
    "## Acceptance",
    mvp.length === 0
      ? "- [ ] A user completes the main task end to end."
      : mvp
          .map(
            (f) => `- [ ] ${line(f)}: works end to end on desktop and mobile`,
          )
          .join("\n"),
    "## Tests",
    "- [ ] Unit tests for the core logic of each MVP feature\n- [ ] One end-to-end test of the main flow\n- [ ] No test calls a paid external API",
    "## Acquisition",
    bullets(a?.channels ?? [], "No channels named."),
    `Keywords to target: ${
      keywords
        .slice(0, 5)
        .map((k) => `"${line(k.phrase)}"`)
        .join(", ") || NO_DATA
    }`,
    "## Pricing and Experiments",
    a ? `Pricing hypothesis: ${line(a.pricing)}` : notAnalysed,
    o.experiments.length === 0
      ? "- [ ] Plan a paid validation experiment. Clicks and waitlist sign-ups are not sales."
      : o.experiments
          .map((e) =>
            [
              `- **${e.kind}** (${e.status}): ${line(e.hypothesis)}`,
              `  - Channel: ${line(e.channel)}; event: ${line(e.metric)}; budget ${usd(e.budgetUsd)}; ${e.durationDays} days`,
              `  - Success: ${line(e.successThreshold)}; stop: ${line(e.stopCondition)}`,
              ...(e.resultNote ? [`  - Result: ${line(e.resultNote)}`] : []),
            ].join("\n"),
          )
          .join("\n"),
    "## Risks",
    bullets(a?.risks ?? [], "No risks named."),
  );
  if (o.decisions.length > 0)
    sections.push(
      "## Decisions",
      o.decisions
        .map(
          (d) =>
            `- ${date(d.createdAt)} ${d.decision} by ${line(d.deciderName)} (scoring ${d.scoringVersion}, score ${d.score}): ${line(d.reason)}`,
        )
        .join("\n"),
    );
  sections.push(
    "---",
    `Generated by Termrise. AI text (${[o.analystProvider, o.analystModel].filter(Boolean).join(" ")}) is a hypothesis to check, not evidence.`,
  );
  return `${sections.join("\n\n")}\n`;
}
