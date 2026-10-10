import { expect, it } from "vitest";

import { isDedicated, isHomepage, serpCompetition } from "./serp-competition";

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
