import type { AnalysisInput, OpportunityAnalyst } from "../opportunity-analyst";

/** A cluster containing this marker makes the fake analyst return invalid output. */
export const FAKE_ANALYST_INVALID = "[bad-ai]";

// Test analyst: fills the analysis from templates and the evidence it is given. Not an
// AI and not advice; the UI labels its text as test output.
export function createFakeAnalyst(): OpportunityAnalyst {
  return {
    name: "fake",
    promptVersion: "fake-v1",
    async analyze(input: AnalysisInput) {
      if (input.cluster.includes(FAKE_ANALYST_INVALID))
        return { targetUser: "" };
      const top = [...input.keywords].sort(
        (a, b) => (b.searchVolume ?? -1) - (a.searchVolume ?? -1),
      );
      const tools = top.filter((k) =>
        /\b(tool|app|generator|online)\b/.test(k.phrase),
      );
      return {
        targetUser: `People searching for "${input.cluster}"`,
        job: `Get "${input.cluster}" done without a general-purpose product`,
        alternatives: input.serpTitles.slice(0, 3),
        differentiation: `A focused tool for "${(tools[0] ?? top[0])?.phrase ?? input.cluster}"`,
        pricing: "Test hypothesis: free tier, paid plan for heavier use",
        channels:
          input.signalSources.length > 0
            ? input.signalSources.slice(0, 3)
            : ["Search"],
        mvpScope: top.slice(0, 3).map((k) => `Page for "${k.phrase}"`),
        risks: ["Test analysis: check the search results before building"],
      };
    },
  };
}
