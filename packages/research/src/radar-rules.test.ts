import { expect, it } from "vitest";

import { radarTerm, safeUrl, seedFromTerm } from "./radar-rules";
import { SEED_MAX_LENGTH } from "./research-rules";

it("drops the HN prefix and normalizes the title", () => {
  expect(radarTerm("Show HN:  My  Invoice Tool")).toBe("my invoice tool");
  expect(radarTerm("Ask HN: Who is hiring?")).toBe("who is hiring?");
  expect(radarTerm("launch hn: Foo (YC W26)")).toBe("foo (yc w26)");
  expect(radarTerm("Rust 2.0 released")).toBe("rust 2.0 released");
});

it("cuts a long term at a word boundary to fit a seed", () => {
  expect(seedFromTerm("short term")).toBe("short term");
  const long = `${"word ".repeat(30)}end`;
  const seed = seedFromTerm(long);
  expect(seed.length).toBeLessThanOrEqual(SEED_MAX_LENGTH);
  expect(seed.endsWith("word")).toBe(true);
  expect(seedFromTerm("x".repeat(100))).toHaveLength(SEED_MAX_LENGTH);
});

it("keeps only http and https links", () => {
  expect(safeUrl("https://example.com/a")).toBe("https://example.com/a");
  expect(safeUrl("http://example.com")).toBe("http://example.com/");
  expect(safeUrl("javascript:alert(1)")).toBeNull();
  expect(safeUrl("not a url")).toBeNull();
  expect(safeUrl(undefined)).toBeNull();
});
