import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { GRADERS } from "./grade.mjs";

const read = (path) =>
  JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const matrix = read("files/clipo/matrix.json");
const { keywords } = read("files/clipo/expected.json");

const state = (overrides = {}) => ({
  keywords: keywords.map((keyword) => ({ keyword, source: "ahrefs" })),
  matrix,
  briefs: {},
  changed: ["seo/keywords.csv", "seo/matrix.json"],
  validate: { ok: true, output: "seo/matrix.json is valid" },
  ...overrides,
});

const failed = (expectations) =>
  expectations.filter((e) => !e.passed).map((e) => e.text);

describe("matrix-from-exports", () => {
  it("passes the reference matrix", () => {
    expect(failed(GRADERS["matrix-from-exports"](state()))).toEqual([]);
  });

  it("fails merged intents, planned competitors and edits outside seo/", () => {
    const merged = structuredClone(matrix);
    // Put the "best …" keywords into the tool cluster and plan the competitor.
    merged.clusters[0].keywords.push(...merged.clusters[4].keywords);
    merged.clusters.splice(4, 1);
    merged.clusters.find((c) => c.id === "creatify-alternative").status =
      "planned";
    expect(
      failed(
        GRADERS["matrix-from-exports"](
          state({
            matrix: merged,
            changed: ["seo/matrix.json", "apps/web/messages/en.json"],
          }),
        ),
      ),
    ).toEqual([
      "Keywords with different intent are in different clusters",
      "Competitor keywords are not planned or published",
      "No cluster is planned or published and no brief is written: the maintainer picks the first batch",
      "Only files under seo/ changed",
    ]);
  });
});

describe("briefs-for-first-batch", () => {
  it("needs both briefs with every section and both clusters planned", () => {
    const planned = structuredClone(matrix);
    for (const c of planned.clusters)
      if (c.id === "etsy-listing-video") c.status = "planned";
    const brief = [
      "Reader question",
      "Outline",
      "Facts to use",
      "Not in this page",
    ]
      .map((h) => `## ${h}\n\ntext\n`)
      .join("\n");
    expect(
      failed(
        GRADERS["briefs-for-first-batch"](
          state({ matrix: planned, briefs: { "etsy-listing-video": brief } }),
        ),
      ),
    ).toEqual([
      "A brief exists for each chosen cluster",
      "Each brief has the template sections",
      "The chosen clusters are planned",
    ]);
  });
});

describe("search-console-review", () => {
  it("accepts no import and needs source gsc on imported queries", () => {
    expect(failed(GRADERS["search-console-review"](state()))).toEqual([]);
    expect(
      failed(
        GRADERS["search-console-review"](
          state({
            keywords: [
              { keyword: "do ai credits expire", source: "gsc" },
              { keyword: "ai credits refund", source: "manual" },
            ],
          }),
        ),
      ),
    ).toEqual([
      "Search Console queries imported into seo/keywords.csv have source gsc",
    ]);
  });
});
