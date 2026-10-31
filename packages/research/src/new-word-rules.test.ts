import { expect, it } from "vitest";

import { curveFacts, dedicatedPages, newWordVerdict } from "./new-word-rules";

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
  expect(facts.ratio).toBeCloseTo(22 / 40);
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
