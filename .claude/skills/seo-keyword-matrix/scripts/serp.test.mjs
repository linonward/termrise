import { describe, expect, it } from "vitest";

import { clusterBySerp, normalizeUrl, readSerpExport } from "./serp.mjs";

it("compares URLs without hash, trailing slash or host case", () => {
  expect(normalizeUrl(" https://Example.com/a/#top ")).toBe(
    "https://example.com/a",
  );
  expect(normalizeUrl("not a url")).toBe("not a url");
});

describe("readSerpExport", () => {
  it("keeps the top results per keyword in position order", () => {
    const csv = [
      "Keyword,URL,Position",
      "AI Video,https://c.com,3",
      "ai video,https://a.com,1",
      "ai video,https://b.com/,2",
      "ai video,https://a.com#x,4",
      "other,https://z.com,1",
    ].join("\n");
    const serps = readSerpExport(
      csv,
      { keyword: "Keyword", url: "URL", position: "Position" },
      2,
    );
    expect(serps).toEqual(
      new Map([
        ["ai video", ["https://a.com", "https://b.com"]],
        ["other", ["https://z.com"]],
      ]),
    );
  });
});

describe("clusterBySerp", () => {
  const serps = new Map([
    ["a", ["1", "2", "3", "4"]],
    ["b", ["1", "2", "3", "9"]],
    ["c", ["2", "3", "4", "8"]],
    ["d", ["7", "8", "9", "0"]],
  ]);

  it("groups keywords that share enough results with the largest one", () => {
    const volumes = new Map([
      ["a", 100],
      ["b", 500],
      ["c", 50],
    ]);
    // b leads: a shares 3 with b, c shares only 2 with b.
    expect(clusterBySerp(serps, volumes, 3)).toEqual([
      { primary: "b", keywords: ["b", "a"] },
      { primary: "c", keywords: ["c"] },
      { primary: "d", keywords: ["d"] },
    ]);
  });

  it("orders keywords without volume by name", () => {
    expect(clusterBySerp(serps, new Map(), 3)[0]).toEqual({
      primary: "a",
      keywords: ["a", "b", "c"],
    });
  });
});
