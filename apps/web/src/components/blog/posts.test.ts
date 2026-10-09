import { describe, expect, it } from "vitest";

import { messages } from "@/i18n/messages";

import { BLOG_POSTS, BLOG_SLUGS, splitLink } from "./posts";

describe("splitLink", () => {
  it("returns null for copy without a link", () => {
    expect(splitLink("No link here.")).toBeNull();
  });

  it("splits copy around the link", () => {
    expect(splitLink("Try <link>the app</link> today.")).toEqual({
      before: "Try ",
      link: "the app",
      after: " today.",
    });
  });

  it("handles a link at the start or the end", () => {
    expect(splitLink("<link>the app</link> adds it.")).toEqual({
      before: "",
      link: "the app",
      after: " adds it.",
    });
    expect(splitLink("Use <link>the app</link>")).toEqual({
      before: "Use ",
      link: "the app",
      after: "",
    });
  });
});

describe("blog body links", () => {
  const tags = (value: unknown): string[] =>
    typeof value === "string"
      ? (value.match(/<\/?link>/g) ?? [])
      : typeof value === "object" && value !== null
        ? Object.values(value).flatMap(tags)
        : [];

  it.each(BLOG_SLUGS)(
    "%s links to its target exactly once in each locale",
    (slug) => {
      for (const locale of ["en", "zh"] as const)
        expect(
          tags(messages[locale].blog.posts[BLOG_POSTS[slug].key].sections),
          locale,
        ).toEqual(["<link>", "</link>"]);
    },
  );

  // Titles, summaries and figure captions render as plain text.
  it("uses link tags only in post sections", () => {
    for (const locale of ["en", "zh"] as const) {
      const { posts, ...rest } = messages[locale].blog;
      const outsideSections = [
        rest,
        ...Object.values(posts).map((post) =>
          Object.fromEntries(
            Object.entries(post).filter(([key]) => key !== "sections"),
          ),
        ),
      ];
      expect(tags(outsideSections), locale).toEqual([]);
    }
  });
});

describe("related posts", () => {
  it.each(BLOG_SLUGS)("%s lists other existing posts", (slug) => {
    const related: readonly string[] = BLOG_POSTS[slug].related;
    for (const other of related) {
      expect(BLOG_SLUGS, other).toContain(other);
      expect(other).not.toBe(slug);
    }
    expect(new Set(related).size).toBe(related.length);
  });
});
