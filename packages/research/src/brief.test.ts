import { expect, it } from "vitest";

import { briefFileName, buildBrief } from "./brief";
import type { OpportunityDetailDto } from "./research-dto";

const base: OpportunityDetailDto = {
  id: "o1",
  projectId: "p1",
  projectName: "Notes",
  cluster: "meeting notes",
  status: "go",
  nextDecisions: ["needs_validation"],
  score: 72,
  dimensions: {
    trend: 3,
    demand: 4,
    competition: 4,
    commercial: 4,
    mvp: 4,
    distribution: 2,
  },
  confidence: 80,
  needsReview: false,
  rank: 1,
  scoringVersion: "v1",
  analysis: {
    targetUser: "Sales reps",
    job: "Summarize calls",
    alternatives: ["Otter"],
    differentiation: "CRM-ready | short",
    pricing: "$9 a month",
    channels: ["r/sales"],
    mvpScope: ["Paste a transcript", "Get a summary"],
    risks: ["Big players"],
  },
  analysisError: null,
  analystProvider: "deepseek",
  starred: false,
  serpCompetition: {
    phrase: "meeting notes",
    results: 10,
    homepages: 3,
    innerPages: 7,
    dedicatedPages: 2,
  },
  buildAdvice: {
    version: "build-v1",
    advice: "new_site",
    reasons: ["volume_high", "kd_low", "dedicated_few"],
  },
  analystModel: "deepseek-flash",
  evaluatedAt: "2026-10-10T00:00:00.000Z",
  keywords: [
    {
      id: "k1",
      phrase: "meeting notes",
      source: "seed",
      seed: "meeting notes",
      provider: "fake",
      searchVolume: 5400,
      cpcUsd: 2.5,
      adsCompetition: 40,
      keywordDifficulty: null,
      fetchedAt: "2026-10-10T00:00:00.000Z",
    },
  ],
  serps: [
    {
      phrase: "meeting notes",
      provider: "fake",
      device: "desktop",
      fetchedAt: "2026-10-10T00:00:00.000Z",
      results: [
        { rank: 1, url: "https://otter.ai/x", title: "Otter", type: "organic" },
      ],
    },
  ],
  signals: [],
  decisions: [
    {
      id: "d1",
      decision: "go",
      reason: "Pre-orders\ncame in",
      deciderName: "Ada",
      evaluationId: "e1",
      scoringVersion: "v1",
      score: 72,
      createdAt: "2026-10-11T00:00:00.000Z",
    },
  ],
  experiments: [],
};

it("covers every section a coding agent needs, from stored data only", () => {
  const md = buildBrief(base);
  for (const heading of [
    "User",
    "Problem",
    "Competitors",
    "MVP Features",
    "Out of Scope",
    "Pages",
    "API",
    "Data",
    "Acceptance",
    "Tests",
    "Acquisition",
    "Pricing and Experiments",
    "Risks",
    "Decisions",
    "Build Advice",
  ])
    expect(md).toContain(`\n## ${heading}\n`);
  expect(md).toContain("# Product Brief: meeting notes");
  expect(md).toContain("Build a new site around the keyword. Rules build-v1");
  expect(md).toContain(
    'Top 10 results for "meeting notes": 3 home pages, 7 inner pages, 2 made for the keyword.',
  );
  expect(md).toContain("| meeting notes | 5400 | $2.50 | no data |");
  expect(md).toContain("1. Otter (otter.ai)");
  expect(md).toContain("- [ ] Paste a transcript");
  expect(md).toContain(
    "2026-10-11 go by Ada (scoring v1, score 72): Pre-orders came in",
  );
  expect(md).toContain("AI text (deepseek deepseek-flash) is a hypothesis");
});

it("labels test data only when a provider is fake", () => {
  expect(buildBrief(base)).toContain("**Test data.**");
  expect(buildBrief({ ...base, keywords: [] })).not.toContain("Test data");
});

it("labels test data and says when the analysis is missing", () => {
  const md = buildBrief({
    ...base,
    analystProvider: "fake",
    analysis: null,
    analysisError: "AI_INVALID_OUTPUT",
    decisions: [],
  });
  expect(md).toContain("**Test data.**");
  expect(md).toContain("Not analysed");
  expect(md).not.toContain("## Decisions");
});

it("names the file after the opportunity", () => {
  expect(briefFileName({ cluster: "AI meeting notes!" })).toBe(
    "brief-ai-meeting-notes.md",
  );
  expect(briefFileName({ cluster: "笔记" })).toBe("brief-opportunity.md");
});
