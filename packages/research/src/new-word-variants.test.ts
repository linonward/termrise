import { expect, it } from "vitest";

import { sameNeed, variantGroups } from "./new-word-variants";

it("treats spacing, word order, generic words and tool synonyms as the same need", () => {
  expect(sameNeed("flyingcar", "flying car")).toBe(true);
  expect(sameNeed("flying-car", "Flying Car")).toBe(true);
  expect(sameNeed("goodbye gta 5 ai video", "gta 5 goodbye video")).toBe(true);
  expect(sameNeed("secret santa maker", "secret santa generator")).toBe(true);
  expect(sameNeed("nba trade evaluator", "nba trade analyzer")).toBe(true);
  expect(sameNeed("ai headshots", "ai headshot free")).toBe(false); // one telling word
  // A long tail is not a variant.
  expect(sameNeed("ragdoll robot boxing", "ragdoll robot boxing codes")).toBe(
    false,
  );
  expect(sameNeed("flying car", "flying car ramp")).toBe(false);
});

it("groups the words that share a key", () => {
  const groups = variantGroups([
    { phrase: "flying car" },
    { phrase: "flyingcar" },
    { phrase: "flying-car" },
    { phrase: "secret santa generator" },
    { phrase: "ragdoll robot boxing" },
  ]);
  expect(groups.map((g) => g.map((w) => w.phrase))).toEqual([
    ["flying car", "flyingcar", "flying-car"],
  ]);
});
