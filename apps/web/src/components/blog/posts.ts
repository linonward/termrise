// Blog posts (docs/product/ux.md#blog-pages): one route per informational search
// query, copy in messages under blog.posts.<key>. Add a post here and its copy in
// every locale; the sitemap and the index pick it up.
export type BlogPost = {
  key: "gettingStarted";
  published: string;
  updated: string;
  // The one conversion page the post links to from its body.
  target: "/" | "/pricing";
  // Other post slugs shown under "Keep reading", picked by hand.
  related: readonly string[];
};

export const BLOG_POSTS = {
  "getting-started": {
    key: "gettingStarted",
    published: "2026-10-10",
    updated: "2026-10-10",
    target: "/",
    related: [] as readonly string[],
  },
} as const satisfies Record<string, BlogPost>;

export type BlogSlug = keyof typeof BLOG_POSTS;

// Newest first.
export const BLOG_SLUGS = (Object.keys(BLOG_POSTS) as BlogSlug[]).sort((a, b) =>
  BLOG_POSTS[b].updated.localeCompare(BLOG_POSTS[a].updated),
);

export function isBlogSlug(slug: string): slug is BlogSlug {
  return Object.hasOwn(BLOG_POSTS, slug);
}

// Splits copy around its <link>…</link> tag (the body link to the post's target).
export function splitLink(
  text: string,
): { before: string; link: string; after: string } | null {
  const match = /^([\s\S]*?)<link>([\s\S]+?)<\/link>([\s\S]*)$/.exec(text);
  return match ? { before: match[1], link: match[2], after: match[3] } : null;
}
