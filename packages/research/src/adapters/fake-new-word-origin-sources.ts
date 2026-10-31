import type { OriginSource } from "./origin-sources";

// Test sources: a GitHub repo and an HN story for every phrase, and a Hugging Face that
// always fails. `seen` records each search.
export function createFakeNewWordOrigin(
  seen: { source: string; phrase: string; from: string }[],
): OriginSource[] {
  const day = (d: Date) => d.toISOString().slice(0, 10);
  return [
    {
      name: "hacker_news",
      async search(phrase, { from, to }) {
        seen.push({ source: "hacker_news", phrase, from: day(from) });
        return [
          {
            source: "hacker_news",
            kind: "story",
            title: `Show HN: ${phrase}`,
            url: "https://news.ycombinator.com/item?id=1",
            at: to.toISOString(),
            score: 10,
          },
        ];
      },
    },
    {
      name: "hugging_face",
      async search() {
        throw new Error("huggingface.co returned 503");
      },
    },
    {
      name: "github",
      async search(phrase, { from }) {
        seen.push({ source: "github", phrase, from: day(from) });
        const name = phrase.split(" ").slice(0, 2).join("-");
        return [
          {
            source: "github",
            kind: "repo",
            title: `a/${name}`,
            url: `https://github.com/a/${name}`,
            at: new Date(from.getTime() + 86_400_000).toISOString(),
            score: 100,
          },
        ];
      },
    },
  ];
}
