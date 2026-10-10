// Rule-based search intent of a phrase (docs/architecture/data-model.md#opportunities).
// The AI analyst may refine it later; scores only ever use these rules.
export type Intent =
  "informational" | "commercial" | "transactional" | "navigational";

const TRANSACTIONAL =
  /\b(buy|pricing|price|cost|discount|coupon|subscription|download|free trial)\b/;
const COMMERCIAL =
  /\b(best|top|vs|versus|alternative|alternatives|review|reviews|compare|comparison|tool|tools|app|apps|software|platform|generator|template|online)\b/;
const INFORMATIONAL =
  /\b(how|what|why|when|guide|tutorial|examples?|meaning|ideas)\b/;
const NAVIGATIONAL = /\b(login|log in|sign in|website|official)\b/;
// Phrases that ask for something to use: the product kind an indie developer can build.
// v2 adds product nouns ("note taker", "recorder", "software") and a bare "ai", which
// asks for an AI tool: "ai meeting notes", "meeting summary ai".
const TOOL =
  /\b(tools?|apps?|generators?|calculators?|templates?|checkers?|converters?|extensions?|plugins?|online|api|ai|software|platform|bots?|chatbots?|assistants?|takers?|notetakers?|makers?|builders?|creators?|editors?|recorders?|transcription|transcribers?|summarizers?|translators?|scanners?|trackers?|planners?|detectors?|removers?|downloaders?|writers?|integrations?)\b/;

export function classifyIntent(phrase: string): Intent {
  if (NAVIGATIONAL.test(phrase)) return "navigational";
  if (TRANSACTIONAL.test(phrase)) return "transactional";
  // A question is a search for an answer, even about a tool: "how to use x app".
  if (INFORMATIONAL.test(phrase)) return "informational";
  if (COMMERCIAL.test(phrase)) return "commercial";
  // A bare topic gives no sign of buying: count it as informational, never inflate intent.
  return "informational";
}

export const hasToolIntent = (phrase: string) => TOOL.test(phrase);
