import { expect, it } from "vitest";

import { normalizeSeeds, seedsFromText } from "./research-rules";

it("normalizes, lower-cases and de-duplicates seed terms in order", () => {
  expect(
    normalizeSeeds(["  AI  Meeting Notes ", "ai meeting notes", "", "Ｚoom"]),
  ).toEqual(["ai meeting notes", "zoom"]);
});

it("reads one seed per line", () => {
  expect(seedsFromText("one\n\n two \r\nThree")).toEqual([
    "one",
    "two",
    "three",
  ]);
});
