import { describe, expect, it } from "vitest";

import {
  formatKeywordsCsv,
  mergeKeywords,
  normalizeKeyword,
  parseCsv,
  readExport,
  readKeywordsCsv,
} from "./keywords.mjs";

it("normalizes case, width and spaces", () => {
  expect(normalizeKeyword("  AI   Video\tＧenerator ")).toBe(
    "ai video generator",
  );
});

describe("parseCsv", () => {
  it("reads quoted fields with commas, quotes and newlines", () => {
    expect(parseCsv('a,"b, ""c""\nd"\r\n1,2\n')).toEqual([
      ["a", 'b, "c"\nd'],
      ["1", "2"],
    ]);
  });

  it("drops a byte order mark and reads tab-separated files", () => {
    expect(parseCsv("\uFEFFa\tb\n1\t2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("readExport", () => {
  const csv =
    'Keyword,Volume,KD\nAI Video Maker,"1,200",31\nai video maker,90,\n,5,1\nfoo,<10,n/a\n';

  it("reads the named columns and keeps the first row of a duplicate", () => {
    expect(
      readExport(
        csv,
        { keyword: "Keyword", volume: "Volume", difficulty: "KD" },
        "ahrefs",
      ),
    ).toEqual([
      {
        keyword: "ai video maker",
        volume: 1200,
        difficulty: 31,
        source: "ahrefs",
      },
      {
        keyword: "foo",
        volume: undefined,
        difficulty: undefined,
        source: "ahrefs",
      },
    ]);
  });

  it("fails when a named column is missing", () => {
    expect(() => readExport(csv, { keyword: "Query" }, "gsc")).toThrow(
      'Column "Query" not found',
    );
  });
});

describe("mergeKeywords", () => {
  it("adds new keywords, updates known figures and keeps old ones", () => {
    const merged = mergeKeywords(
      [
        { keyword: "b", volume: 10, difficulty: 5, source: "gsc" },
        { keyword: "c", volume: 1, source: "gsc" },
      ],
      [
        { keyword: "b", volume: 20, source: "ahrefs" },
        { keyword: "a", source: "ahrefs" },
      ],
    );
    expect(merged).toEqual([
      { keyword: "a", source: "ahrefs" },
      { keyword: "b", volume: 20, difficulty: 5, source: "ahrefs" },
      { keyword: "c", volume: 1, source: "gsc" },
    ]);
  });
});

it("writes and reads seo/keywords.csv", () => {
  const list = [
    {
      keyword: 'say "hi", now',
      volume: 3,
      difficulty: undefined,
      source: "manual",
    },
  ];
  const text = formatKeywordsCsv(list);
  expect(text).toBe(
    'keyword,volume,difficulty,source\n"say ""hi"", now",3,,manual\n',
  );
  expect(readKeywordsCsv(text)).toEqual(list);
});
