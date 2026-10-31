import { describe, expect, it } from "vitest";

import {
  createGitHubOrigin,
  createHackerNewsOrigin,
  createHuggingFaceOrigin,
} from "./origin-sources";

const window = {
  from: new Date("2026-10-01T00:00:00Z"),
  to: new Date("2026-10-28T00:00:00Z"),
};
const stub = (body: unknown, seen: string[] = []) =>
  (async (url: string) => {
    seen.push(url);
    return Response.json(body);
  }) as unknown as typeof fetch;

describe("createHackerNewsOrigin", () => {
  it("searches stories with the exact phrase inside the window", async () => {
    const seen: string[] = [];
    const hn = createHackerNewsOrigin({
      fetch: stub(
        {
          hits: [
            {
              objectID: "49980866",
              title: "Google Nano Banana 2.1",
              url: "https://gemini.google/overview/image-generation/",
              points: 7,
              num_comments: 0,
              created_at_i: 1791304587,
            },
            {
              objectID: "2",
              title: "Ask HN: nano banana?",
              created_at_i: 1791304000,
            },
          ],
        },
        seen,
      ),
    });
    const items = await hn.search("nano banana", window);
    const url = new URL(seen[0]);
    expect(url.searchParams.get("query")).toBe('"nano banana"');
    expect(url.searchParams.get("numericFilters")).toBe(
      "created_at_i>1790812800,created_at_i<1793145600",
    );
    expect(items[0]).toMatchObject({
      source: "hacker_news",
      kind: "story",
      title: "Google Nano Banana 2.1",
      url: "https://gemini.google/overview/image-generation/",
      score: 7,
    });
    // A text post links to its discussion.
    expect(items[1].url).toBe("https://news.ycombinator.com/item?id=2");
  });
});

describe("createHuggingFaceOrigin", () => {
  it("lists models and Spaces by the dashed name, made before the window ends", async () => {
    const seen: string[] = [];
    const hf = createHuggingFaceOrigin({
      fetch: stub(
        [
          {
            id: "Qwen/Qwen-Image-2.1",
            likes: 3503,
            createdAt: "2026-09-14T03:47:26.000Z",
            pipeline_tag: "text-to-image",
          },
          { id: "late/copy", likes: 1, createdAt: "2026-10-30T00:00:00.000Z" },
        ],
        seen,
      ),
    });
    const items = await hf.search("qwen image", window);
    expect(seen.map((u) => new URL(u).pathname)).toEqual([
      "/api/models",
      "/api/spaces",
    ]);
    expect(new URL(seen[0]).searchParams.get("search")).toBe("qwen-image");
    expect(items.map((i) => [i.kind, i.url])).toEqual([
      ["model", "https://huggingface.co/Qwen/Qwen-Image-2.1"],
      ["space", "https://huggingface.co/spaces/Qwen/Qwen-Image-2.1"],
    ]);
    expect(items[0]).toMatchObject({ score: 3503, note: "text-to-image" });
  });
});

describe("createGitHubOrigin", () => {
  it("finds repositories created in the window, most stars first, with the token when given", async () => {
    const calls: { url: string; headers: Record<string, string> }[] = [];
    const gh = createGitHubOrigin({
      token: "t0k",
      fetch: (async (url: string, init: RequestInit) => {
        calls.push({ url, headers: init.headers as Record<string, string> });
        return Response.json({
          items: [
            {
              full_name: "a/nano-banana-ui",
              html_url: "https://github.com/a/nano-banana-ui",
              description: "A UI for Nano Banana",
              stargazers_count: 842,
              created_at: "2026-10-02T00:07:56Z",
            },
          ],
        });
      }) as unknown as typeof fetch,
    });
    const items = await gh.search("nano banana", window);
    expect(new URL(calls[0].url).searchParams.get("q")).toBe(
      '"nano banana" in:name,description created:2026-10-01..2026-10-28',
    );
    expect(calls[0].headers.authorization).toBe("Bearer t0k");
    expect(items).toEqual([
      {
        source: "github",
        kind: "repo",
        title: "a/nano-banana-ui",
        url: "https://github.com/a/nano-banana-ui",
        at: "2026-10-02T00:07:56.000Z",
        score: 842,
        note: "A UI for Nano Banana",
      },
    ]);
  });

  it("fails loudly on an error status so the caller can skip the source", async () => {
    const gh = createGitHubOrigin({
      fetch: (async () =>
        new Response("", { status: 403 })) as unknown as typeof fetch,
    });
    await expect(gh.search("x", window)).rejects.toThrow(/403/);
  });
});
