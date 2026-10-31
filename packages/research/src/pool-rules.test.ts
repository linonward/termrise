import { describe, expect, it } from "vitest";

import type { KeywordIdea } from "./keyword-provider";
import {
  autoExclude,
  screenKeywords,
  strongCompetitors,
  endsWithSuffix,
  noToolPage,
} from "./pool-rules";

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

describe("tool-site-v2", () => {
  it("wants the suffix as the last word", () => {
    expect(endsWithSuffix("grammar checker", "checker")).toBe(true);
    expect(endsWithSuffix("unit converters", "converter")).toBe(true);
    expect(endsWithSuffix("checker", "checker")).toBe(true);
    expect(endsWithSuffix("checker board", "checker")).toBe(false);
    // A preposition or a modifier after the tool word keeps it a tool.
    expect(endsWithSuffix("tax calculator for ny", "calculator")).toBe(true);
    expect(endsWithSuffix("license plate checker free", "checker")).toBe(true);
    expect(endsWithSuffix("pregnancy checker online", "checker")).toBe(true);
    expect(endsWithSuffix("checker game free", "checker")).toBe(false);
    expect(endsWithSuffix("chinese checker board", "checker")).toBe(false);
  });

  it("excludes a screened keyword whose suffix is not last, for the maintainer to confirm", () => {
    const idea = (phrase: string) => ({
      phrase,
      metrics: {
        searchVolume: 27_100,
        keywordDifficulty: 1,
        cpcMicros: 520_000,
        adsCompetition: null,
      },
      monthlySearches: Array(12).fill(27_100),
    });
    const rows = screenKeywords(
      [
        idea("checker board"),
        {
          ...idea("grammar checker"),
          metrics: { ...idea("x").metrics, searchVolume: 9_900 },
        },
      ],
      "checker",
    );
    const board = rows.find((r) => r.phrase === "checker board")!;
    expect(board.status).toBe("excluded");
    expect(board.reasons[0]).toEqual({
      rule: "exclude",
      result: "unsure",
      value: "not_suffix",
    });
    expect(rows.find((r) => r.phrase === "grammar checker")!.status).not.toBe(
      "excluded",
    );
  });

  it("sees no tool intent when the pages read hold no tool", () => {
    const page = (kind: string | null) => ({ kind });
    expect(noToolPage([page("store"), page("article"), page("video")])).toBe(
      true,
    );
    expect(noToolPage([page("store"), page("tool"), page("video")])).toBe(
      false,
    );
    // Too few pages read to say.
    expect(noToolPage([page("store"), page(null), page(null)])).toBeNull();
  });
});
