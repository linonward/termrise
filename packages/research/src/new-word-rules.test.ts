import { expect, it } from "vitest";

import {
  curveFacts,
  dedicatedPages,
  newWordVerdict,
  officialPages,
  serpRole,
  passesScreen,
  splitComparison,
} from "./new-word-rules";

// 30 days of [word, gpts]: nothing for 26 days, then a burst.
const days = (word: number[], ref = 40) =>
  word.map((v, i) => ({
    at: `2026-10-${String(i + 2).padStart(2, "0")}`,
    values: [v, ref],
  }));

it("finds the burst, the peak and the heat against gpts", () => {
  const facts = curveFacts(days([...Array(26).fill(0), 0, 5, 30, 22]));
  expect(facts).toMatchObject({
    burstDay: "2026-10-29",
    peakDay: "2026-10-30",
    isNew: true,
    fromZero: true,
    rising: true,
    ratioDay: "2026-10-31",
  });
  // The last 7 days: 0+0+0+0+5+30+22 against 7 × 40.
  expect(facts.ratio).toBeCloseTo(57 / 280);
});

it("does not call a steady word new", () => {
  const facts = curveFacts(days(Array(30).fill(20)));
  expect(facts).toMatchObject({ isNew: false, rising: false, fromZero: false });
  expect(facts.ratio).toBeCloseTo(0.5);
});

it("has no facts without any interest", () => {
  expect(curveFacts(days(Array(30).fill(0)))).toMatchObject({
    peakDay: null,
    ratio: null,
  });
});

it("counts pages made for the phrase by title or address", () => {
  const results = [
    { url: "https://a.com/ragdoll-robot-boxing-codes", title: "Codes" },
    { url: "https://b.com/x", title: "Ragdoll Robot Boxing guide" },
    { url: "https://c.com/robot", title: "Robots" },
  ];
  expect(dedicatedPages("ragdoll robot boxing", results)).toBe(2);
});

it("does not count the maker's own page or a platform listing as competition", () => {
  const phrase = "lumo edit";
  const results = [
    { url: "https://lumoedit.com/", title: "Lumo Edit" },
    { url: "https://huggingface.co/lumo/Lumo-Edit", title: "lumo/Lumo-Edit" },
    { url: "https://github.com/lumo/lumo-edit", title: "lumo-edit" },
    {
      url: "https://www.reddit.com/r/x/lumo_edit",
      title: "Lumo Edit is great",
    },
    {
      url: "https://aitools.com/lumo-edit-online",
      title: "Lumo Edit online free",
    },
    { url: "https://huggingface.co/other/model", title: "Other model" },
  ];
  expect(results.map((r) => serpRole(phrase, r))).toEqual([
    "official",
    "official",
    "official",
    "official",
    "dedicated",
    null,
  ]);
  expect(dedicatedPages(phrase, results)).toBe(1);
  expect(officialPages(phrase, results)).toBe(4);
});

it("takes a model maker's site as official only for names of things", () => {
  const page = { url: "https://deepseek.com/v4", title: "DeepSeek V4 Flash" };
  expect(serpRole("deepseek v4 flash", page, "ai")).toBe("official");
  expect(serpRole("deepseek v4 flash", page)).toBe("dedicated");
  // A tool search: a site named after its first word is a competitor.
  const store = {
    url: "https://store.com/stock",
    title: "Store Stock Checker",
  };
  expect(serpRole("store stock checker", store, "tool")).toBe("dedicated");
});

it("says how many official pages it did not count", () => {
  expect(
    newWordVerdict({
      phrase: "lumo edit",
      ratio: 0.2,
      dedicated: 0,
      official: 3,
      rising: true,
      isNew: true,
    }).reasons,
  ).toContainEqual({ code: "official", value: 3 });
});

it("judges like the reference screens", () => {
  // ai impacts theoretical computer science: ×0.554, 0 dedicated pages.
  expect(
    newWordVerdict({
      phrase: "x",
      ratio: 0.554,
      dedicated: 0,
      rising: true,
      isNew: true,
    }),
  ).toMatchObject({
    verdict: "worth",
    buildAs: "new_site",
  });
  // ragdoll robot boxing: ×0.105, 1 dedicated page.
  expect(
    newWordVerdict({
      phrase: "x",
      ratio: 0.105,
      dedicated: 1,
      rising: true,
      isNew: true,
    }).verdict,
  ).toBe("worth");
  // gamestop pokemon valentines box: ×0.066, 4 dedicated pages.
  expect(
    newWordVerdict({
      phrase: "x",
      ratio: 0.066,
      dedicated: 4,
      rising: true,
      isNew: true,
    }),
  ).toMatchObject({
    verdict: "try",
    buildAs: "inner_page",
  });
  // mh outlander tier list: ×0.003, 2 dedicated pages, still rising.
  expect(
    newWordVerdict({
      phrase: "x",
      ratio: 0.003,
      dedicated: 2,
      rising: true,
      isNew: true,
    }).verdict,
  ).toBe("try");
  expect(
    newWordVerdict({
      phrase: "x",
      ratio: 0.5,
      dedicated: 0,
      rising: false,
      isNew: true,
    }).verdict,
  ).toBe("skip");
});

it("skips what the evergreen rules exclude, such as someone else's downloads", () => {
  expect(
    newWordVerdict({
      phrase: "youtube to mp3 player converter app",
      ratio: 0.3,
      dedicated: 0,
      rising: true,
      isNew: true,
    }),
  ).toEqual({
    verdict: "skip",
    buildAs: null,
    reasons: [{ code: "excluded", value: undefined, kind: "downloads" }],
  });
});

it("measures heat as the last 7 days' average against gpts", () => {
  // gpts moves; the word holds at 10 for the last week.
  const curve = [...Array(23).fill(0), 10, 10, 10, 10, 10, 10, 10].map(
    (v, i) => ({
      at: `2026-10-${String(i + 2).padStart(2, "0")}`,
      values: [v, i < 29 ? 20 : 80],
    }),
  );
  const facts = curveFacts(curve);
  expect(facts.ratio).toBeCloseTo(70 / (6 * 20 + 80));
  expect(facts.ratioDay).toBe("2026-10-31");
});

it("finds the first day with interest, the 7-day growth and a one-day spike", () => {
  const climbing = curveFacts(
    days([...Array(16).fill(0), 1, 1, 1, 1, 1, 1, 1, 2, 3, 4, 5, 6, 7, 8]),
  );
  expect(climbing).toMatchObject({ firstDay: "2026-10-18", spike: false });
  // Last 7 days 35 against the 7 before them, 7.
  expect(climbing.growth7).toBeCloseTo(4);
  const fromZero = curveFacts(days([...Array(27).fill(0), 2, 5, 9]));
  expect(fromZero).toMatchObject({ growth7: null, firstDay: "2026-10-29" });
  // One day holds most of the week: a spike, not a trend.
  const spike = curveFacts(days([...Array(26).fill(0), 1, 30, 2, 1]));
  expect(spike.spike).toBe(true);
});

it("takes one word's curve out of a comparison of several", () => {
  const batch = [
    { at: "2026-10-30", values: [1, 2, 3, 40] },
    { at: "2026-10-31", values: [4, 5, 6, 50] },
  ];
  expect(splitComparison(batch, 1, 3)).toEqual([
    { at: "2026-10-30", values: [2, 40] },
    { at: "2026-10-31", values: [5, 50] },
  ]);
});

it("screens a word in before the paid search-result checks", () => {
  const base = { phrase: "x", ratio: 0.01, rising: true };
  expect(passesScreen(base)).toBe(true);
  expect(passesScreen({ ...base, ratio: 0.0005 })).toBe(false);
  expect(passesScreen({ ...base, rising: false })).toBe(false);
  expect(passesScreen({ ...base, phrase: "youtube to mp3 converter" })).toBe(
    false,
  );
});

it("judges a screened-out word without search results, and caps a spike at try", () => {
  expect(
    newWordVerdict({
      phrase: "x",
      ratio: 0.0005,
      dedicated: null,
      rising: true,
      isNew: true,
    }),
  ).toEqual({
    verdict: "skip",
    buildAs: null,
    reasons: [
      { code: "cold", value: 0.001 },
      { code: "rising" },
      { code: "new_word" },
    ],
  });
  expect(
    newWordVerdict({
      phrase: "x",
      ratio: 0.5,
      dedicated: 0,
      rising: true,
      isNew: true,
      spike: true,
    }),
  ).toMatchObject({ verdict: "try", buildAs: "inner_page" });
});

it("leaves a hot word that is already crowded to its long tails", () => {
  const crowded = newWordVerdict({
    phrase: "gemini 4 carbon",
    ratio: 0.8,
    dedicated: 9,
    rising: true,
    isNew: true,
  });
  expect(crowded).toMatchObject({ verdict: "try", buildAs: "long_tail" });
  expect(crowded.reasons).toContainEqual({ code: "crowded" });
  // Not when it no longer rises.
  expect(
    newWordVerdict({
      phrase: "x",
      ratio: 0.8,
      dedicated: 9,
      rising: false,
      isNew: false,
    }).verdict,
  ).toBe("skip");
});
