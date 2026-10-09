import { describe, expect, it } from "vitest";

import { type Cluster, parseMatrix, validateMatrix } from "./keyword-matrix";

const scores = {
  business: 5,
  intent: 5,
  productFit: 5,
  competition: 5,
  demand: 5,
};

function cluster(overrides: Partial<Cluster> = {}): Cluster {
  return {
    id: "how-credits-work",
    primary: "how do credits work",
    keywords: ["how do credits work"],
    intent: "informational",
    scores,
    page: { type: "blog", path: "/blog/how-credits-work" },
    status: "published",
    ...overrides,
  };
}

const site = {
  keywords: [
    "how do credits work",
    "credits explained",
    "ai tool",
    "acme pricing",
  ],
  pages: ["/", "/pricing", "/blog/how-credits-work"],
  briefs: ["how-credits-work", "home"],
};

describe("parseMatrix", () => {
  it("rejects scores outside 1–5 and unknown page types", () => {
    expect(() =>
      parseMatrix({
        clusters: [{ ...cluster(), scores: { ...scores, demand: 6 } }],
      }),
    ).toThrow();
    expect(() =>
      parseMatrix({
        clusters: [{ ...cluster(), page: { type: "compare", path: "/x" } }],
      }),
    ).toThrow();
  });
});

describe("validateMatrix", () => {
  it("accepts a consistent matrix", () => {
    expect(validateMatrix({ clusters: [cluster()] }, site)).toEqual([]);
  });

  it("checks keywords against the list and against other clusters", () => {
    const errors = validateMatrix(
      {
        clusters: [
          cluster({ keywords: ["how do credits work", "Credits Explained"] }),
          cluster({
            id: "other",
            primary: "missing",
            keywords: ["how do credits work"],
            status: "candidate",
            page: { type: "blog", path: "/blog/other" },
          }),
        ],
      },
      site,
    );
    expect(errors).toEqual([
      'how-credits-work: keyword "Credits Explained" is not in seo/keywords.csv',
      'other: primary "missing" is not one of its keywords',
      'other: keyword "how do credits work" is also in how-credits-work',
    ]);
  });

  it("gives each URL to one cluster and each intent its page type", () => {
    const errors = validateMatrix(
      {
        clusters: [
          cluster(),
          cluster({ id: "dup", status: "planned" }),
          cluster({
            id: "home",
            primary: "ai tool",
            keywords: ["ai tool"],
            page: { type: "landing", path: "/" },
          }),
          cluster({
            id: "pricing",
            primary: "acme pricing",
            keywords: ["acme pricing"],
            page: { type: "pricing", path: "/prices" },
            status: "rejected",
          }),
        ],
      },
      site,
    );
    expect(errors).toEqual([
      'dup: keyword "how do credits work" is also in how-credits-work',
      "dup: /blog/how-credits-work is also the page of how-credits-work",
      "dup: no brief at seo/briefs/dup.md",
      "home: informational intent does not fit a landing page",
      "pricing: informational intent does not fit a pricing page",
      "pricing: a pricing page must have the path /pricing",
    ]);
  });

  it("needs a live page for published clusters and a valid blog path", () => {
    expect(
      validateMatrix(
        {
          clusters: [
            cluster({ page: { type: "blog", path: "/blog/Not_Live" } }),
          ],
        },
        site,
      ),
    ).toEqual([
      "how-credits-work: a blog page must have the path /blog/{slug}",
      "how-credits-work: /blog/Not_Live is published but the site has no such page",
    ]);
  });

  it("rejects duplicate cluster ids", () => {
    expect(
      validateMatrix(
        {
          clusters: [
            cluster({ status: "rejected" }),
            cluster({ status: "rejected" }),
          ],
        },
        site,
      ),
    ).toContain("how-credits-work: the id is used by another cluster");
  });
});
