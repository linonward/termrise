import { describe, expect, it } from "vitest";

import { createCommonCrawl, platformHost } from "./common-crawl";

describe("platformHost", () => {
  it("keeps a production subdomain of a platform", () => {
    expect(platformHost("https://Cipher-Decoder.vercel.app/x?y=1")).toEqual({
      host: "cipher-decoder.vercel.app",
      platform: "vercel.app",
    });
    expect(platformHost("https://ann.github.io/")?.platform).toBe("github.io");
    expect(platformHost("https://tool.pages.dev/")?.platform).toBe("pages.dev");
  });

  it("drops preview deployments, test sites and other hosts", () => {
    for (const url of [
      "https://app-git-main-team.vercel.app/",
      "https://app-k3j9x2m1q-team.vercel.app/",
      "https://a1b2c3d4.tool.pages.dev/",
      "https://my-test-site.vercel.app/",
      "https://demo.vercel.app/",
      "https://0101.vercel.app/",
      "https://vercel.app/",
      "https://a.b.vercel.app/",
      "https://example.com/",
      "not a url",
    ])
      expect(platformHost(url), url).toBeNull();
    // A nine-letter word is not a deployment hash.
    expect(
      platformHost("https://photo-generator-tools.vercel.app/"),
    ).not.toBeNull();
  });
});

describe("createCommonCrawl", () => {
  it("reads the newest collection, its page count and a page of hosts, retrying gateway errors", async () => {
    const calls: string[] = [];
    let fails = 1;
    const fetcher = (async (url: string) => {
      calls.push(url);
      if (url.endsWith("collinfo.json"))
        return Response.json([
          { id: "CC-MAIN-2026-43" },
          { id: "CC-MAIN-2026-38" },
        ]);
      if (url.includes("showNumPages"))
        return Response.json({ pages: 9, pageSize: 5, blocks: 41 });
      if (fails-- > 0) return new Response("bad gateway", { status: 502 });
      return new Response(
        [
          '{"url": "https://cipher-decoder.vercel.app/"}',
          '{"url": "https://cipher-decoder.vercel.app/robots.txt"}',
          '{"url": "https://app-git-main-team.vercel.app/"}',
          '{"url": "https://flip-a-coin.vercel.app/about"}',
          "",
        ].join("\n"),
      );
    }) as unknown as typeof fetch;
    const cc = createCommonCrawl({ fetch: fetcher, sleep: async () => {} });
    expect(await cc.latestCollection()).toBe("CC-MAIN-2026-43");
    expect(await cc.pages("CC-MAIN-2026-43", "vercel.app")).toBe(9);
    expect(await cc.hosts("CC-MAIN-2026-43", "vercel.app", 2)).toEqual([
      "cipher-decoder.vercel.app",
      "flip-a-coin.vercel.app",
    ]);
    expect(calls.at(-1)).toContain(
      "url=*.vercel.app&output=json&fl=url&page=2",
    );
  });

  it("gives up after a few gateway errors", async () => {
    const fetcher = (async () =>
      new Response("", { status: 504 })) as unknown as typeof fetch;
    const cc = createCommonCrawl({ fetch: fetcher, sleep: async () => {} });
    await expect(cc.pages("CC-MAIN-2026-43", "pages.dev")).rejects.toThrow(
      /504/,
    );
  });
});
