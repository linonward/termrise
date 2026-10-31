import { describe, expect, it } from "vitest";

import { markEvidence, originWindow, serpMix } from "./new-word-origin";

describe("originWindow", () => {
  it("looks a month before the burst and a week after, never past now", () => {
    const now = new Date("2026-10-31T12:00:00Z");
    expect(originWindow("2026-10-20", new Date("2026-10-25"), now)).toEqual({
      from: new Date("2026-09-20T00:00:00Z"),
      to: new Date("2026-10-27T00:00:00Z"),
    });
    expect(originWindow("2026-10-30", new Date("2026-10-30"), now).to).toEqual(
      now,
    );
    // Without a burst day, the first sighting is the anchor.
    expect(
      originWindow(null, new Date("2026-10-10T00:00:00Z"), now).from,
    ).toEqual(new Date("2026-09-10T00:00:00Z"));
  });
});

describe("serpMix", () => {
  it("counts videos, forums and wikis on page one", () => {
    expect(
      serpMix([
        { site: "www.youtube.com" },
        { site: "reddit.com" },
        { site: "en.wikipedia.org" },
        { site: "genshin-impact.fandom.com" },
        { site: "example.com" },
      ]),
    ).toEqual({ video: 1, social: 1, wiki: 2 });
  });
});

describe("markEvidence", () => {
  it("flags the cited items and the first, ignoring indexes outside the list", () => {
    const e = (title: string) => ({
      source: "github" as const,
      kind: "repo" as const,
      title,
      url: `https://github.com/${title}`,
      at: "2026-10-01T00:00:00.000Z",
      score: 1,
    });
    const marked = markEvidence([e("a/a"), e("b/b"), e("c/c")], {
      originType: "open_source",
      summary: "x",
      first: 1,
      cited: [2, 9],
      capture: "y",
    });
    expect(marked.map((m) => [m.cited, m.first])).toEqual([
      [false, false],
      [true, true],
      [true, false],
    ]);
  });
});
