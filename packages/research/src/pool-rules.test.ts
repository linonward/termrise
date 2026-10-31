import { expect, it } from "vitest";

import type { KeywordIdea } from "./keyword-provider";
import { autoExclude, screenKeywords, strongCompetitors } from "./pool-rules";

const idea = (
  phrase: string,
  searchVolume: number | null,
  keywordDifficulty: number | null,
  cpcUsd: number | null,
  monthlySearches?: number[],
): KeywordIdea => ({
  phrase,
  metrics: {
    searchVolume,
    keywordDifficulty,
    cpcMicros: cpcUsd === null ? null : Math.round(cpcUsd * 1_000_000),
    adsCompetition: null,
  },
  monthlySearches,
});

it("excludes obvious non-tools for the maintainer to confirm", () => {
  expect(autoExclude("generator installation near me")).toBe("offline");
  expect(autoExclude("youtube to mp3 converter")).toBe("downloads");
  expect(autoExclude("best calculator")).toBe("shopping");
  expect(autoExclude("cubic yard calculator")).toBeNull();
});

it("applies H1, H2, H3 and the 12-month ratio, mid-band first", () => {
  const rows = screenKeywords(
    [
      idea("big calculator", 90000, 20, 1),
      idea("small calculator", 8000, 20, 1),
      idea("near me calculator", 20000, 20, 1),
      idea("hard calculator", 9000, 60, 1),
      idea("tiny calculator", 900, 5, 1),
      idea("cheap clicks calculator", 9000, 5, 0.02),
      idea("no cpc calculator", 9000, 5, null),
      idea(
        "seasonal calculator",
        9000,
        5,
        1,
        [10, 10, 10, 60, 60, 10, 10, 10, 10, 10, 10, 10],
      ),
    ],
    "calculator",
  );
  expect(rows.map((r) => [r.phrase, r.status])).toEqual([
    ["small calculator", "pass"],
    ["big calculator", "pass"],
    ["no cpc calculator", "unsure"],
    ["near me calculator", "excluded"],
    ["hard calculator", "failed"],
    ["cheap clicks calculator", "failed"],
    ["seasonal calculator", "failed"],
    ["tiny calculator", "failed"],
  ]);
  const byPhrase = new Map(rows.map((r) => [r.phrase, r.reasons]));
  expect(byPhrase.get("hard calculator")).toEqual([
    { rule: "H2", result: "fail", value: 60, limit: 29 },
  ]);
  expect(byPhrase.get("near me calculator")).toEqual([
    { rule: "exclude", result: "fail", value: "offline" },
  ]);
  expect(byPhrase.get("seasonal calculator")?.[0]).toMatchObject({
    rule: "H6",
    result: "fail",
    value: 6,
    limit: 3,
  });
});

it("groups phrasings with identical numbers under the natural one", () => {
  const rows = screenKeywords(
    [
      idea("concrete calculator concrete calculator", 550000, 24, 2.24),
      idea("concrete calculator", 550000, 20, 2.24),
      idea("calculator for concrete", 550000, 28, 2.24),
      idea("gravel calculator", 9000, 22, 1),
    ],
    "calculator",
  );
  expect(rows.map((r) => r.phrase)).toEqual([
    "gravel calculator",
    "concrete calculator",
  ]);
  expect(rows[1]).toMatchObject({
    variants: [
      "calculator for concrete",
      "concrete calculator concrete calculator",
    ],
    kdRange: [20, 28],
  });
});

it("keeps phrasings apart when their KD gives them a different status", () => {
  // Same volume, CPC and trend; KD differs per phrasing (as DataForSEO reports it).
  const rows = screenKeywords(
    [
      idea("fraction calculator", 9000, 20, 1),
      idea("calculator fraction", 9000, 40, 1),
    ],
    "calculator",
  );
  expect(rows.map((r) => [r.phrase, r.status, r.variants])).toEqual([
    ["fraction calculator", "pass", []],
    ["calculator fraction", "failed", []],
  ]);
});

it("counts strong competitors: big site and a page made for the keyword (H5)", () => {
  const traffic = new Map([
    ["calculator.net", 9_000_000],
    ["omnicalculator.com", 4_000_000],
    ["smallsite.com", 4000],
  ]);
  const results = [
    {
      site: "calculator.net",
      url: "https://calculator.net/roof-pitch",
      title: "Roof Pitch Calculator",
    },
    {
      site: "omnicalculator.com",
      url: "https://omnicalculator.com/x",
      title: "Roofing guide",
    },
    {
      site: "smallsite.com",
      url: "https://smallsite.com/",
      title: "Roof pitch calculator",
    },
    {
      site: "Reddit",
      url: "https://google.com/goto?url=x",
      title: "roof pitch calculator?",
    },
  ];
  expect(strongCompetitors("roof pitch calculator", results, traffic)).toEqual({
    strong: 1,
    innerPages: 3,
    strongSites: ["calculator.net"],
  });
});
