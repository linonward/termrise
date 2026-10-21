import { expect, it } from "vitest";

import {
  clusterSerpKeyword,
  isDedicated,
  isHomepage,
  serpAuditOrder,
  serpCompetition,
} from "./serp-competition";

it("tells home pages from inner pages", () => {
  expect(isHomepage("https://www.read.ai/")).toBe(true);
  expect(isHomepage("https://otter.ai")).toBe(true);
  expect(isHomepage("https://example.com/en/")).toBe(true);
  expect(isHomepage("https://example.com/zh-cn")).toBe(true);
  expect(isHomepage("https://example.com/?ref=x")).toBe(true);
  expect(isHomepage("https://meeting.ai/en/p")).toBe(false);
  expect(isHomepage("https://www.notion.com/help/ai-meeting-notes")).toBe(
    false,
  );
  expect(isHomepage("not a url")).toBe(false);
});

it("finds titles made for the keyword, plurals included", () => {
  expect(
    isDedicated(
      "Minutes: AI Meeting Note Taker - App Store",
      "ai meeting notes",
    ),
  ).toBe(true);
  expect(
    isDedicated(
      "Take AI meeting notes in Notion | Notion Help",
      "ai meeting notes",
    ),
  ).toBe(true);
  expect(isDedicated("Meeting.ai: Work Assistant", "ai meeting notes")).toBe(
    false,
  );
  expect(isDedicated("anything", "")).toBe(false);
});

it("counts the top 10 only", () => {
  const results = [
    { url: "https://www.read.ai/", title: "Meeting Summaries, AI Notetaker" },
    {
      url: "https://www.notion.com/help/ai-meeting-notes",
      title: "Take AI meeting notes in Notion",
    },
    ...Array.from({ length: 10 }, (_, i) => ({
      url: `https://site${i}.example/page`,
      title: `Other ${i}`,
    })),
  ];
  expect(serpCompetition("ai meeting notes", results)).toEqual({
    phrase: "ai meeting notes",
    results: 10,
    homepages: 1,
    innerPages: 9,
    dedicatedPages: 1,
  });
});

it("audits the seeds first, then the expansions with the most searches", () => {
  const keywords = [
    { id: "1", isSeed: false, searchVolume: 5400 },
    { id: "2", isSeed: true, searchVolume: 1300 },
    { id: "3", isSeed: false, searchVolume: 0 },
    { id: "4", isSeed: true, searchVolume: null },
    { id: "5", isSeed: true, searchVolume: 10 },
    { id: "6", isSeed: false, searchVolume: 2400 },
  ];
  // Keywords without searches are not audited: they score nothing.
  expect(serpAuditOrder(keywords, 3).map((k) => k.id)).toEqual(["2", "5", "1"]);
  expect(serpAuditOrder(keywords, 10).map((k) => k.id)).toEqual([
    "2",
    "5",
    "1",
    "6",
  ]);
});

it("lets the seed's own results stand for its cluster when they were audited", () => {
  const members = [
    { id: "e", phrase: "electronic signature platforms", searchVolume: 5400 },
    { id: "s", phrase: "digital sign app", searchVolume: 1300 },
    { id: "x", phrase: "digital sign apps", searchVolume: 1300 },
  ];
  expect(
    clusterSerpKeyword("digital sign app", members, new Set(["e", "s"]))?.id,
  ).toBe("s");
  // Without the seed's results: the audited keyword with the most searches.
  expect(
    clusterSerpKeyword("digital sign app", members, new Set(["e", "x"]))?.id,
  ).toBe("e");
  expect(
    clusterSerpKeyword("digital sign app", members, new Set()),
  ).toBeUndefined();
});
