import type { NewWordClassifier } from "../new-word-analyst";

/** Made-up price of one batch, in micro-USD; not a provider's rate. */
export const FAKE_CLASSES_COST = { max: 2_000, actual: 300 } as const;

// Test classifier: a fixed rule on the words, not an AI. "game" and "ai" in a phrase name
// a game or a model; "vs", "parade" and "lottery" are news; "radar" and "ski" are common
// words; the rest are tools.
export function createFakeNewWordClassifier(): NewWordClassifier {
  return {
    name: "fake",
    model: null,
    promptVersion: "fake-v1",
    maxCostMicros: FAKE_CLASSES_COST.max,
    async classify(items) {
      return {
        value: {
          items: items.map(({ phrase }) => ({
            phrase,
            category: /^(radar|ski)$/.test(phrase)
              ? "generic"
              : /\bgame\b/.test(phrase)
                ? "game"
                : /\bai\b/.test(phrase)
                  ? "ai"
                  : /\b(vs|parade|lottery)\b/.test(phrase)
                    ? "news"
                    : "tool",
          })),
        },
        costMicros: FAKE_CLASSES_COST.actual,
      };
    },
  };
}
