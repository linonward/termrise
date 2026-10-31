import { describe, expect, it } from "vitest";

import { createGoogleAutocomplete } from "./google-autocomplete";
import { pageText, readPage } from "./page-reader";

describe("pageText", () => {
  it("keeps the title, the first heading and visible text only", () => {
    const html = `<html><head><title>Savings Bond Calculator &amp; More</title>
      <style>.x{}</style><script>var a=1</script></head>
      <body><nav>Menu</nav><h1>Savings <b>Bond</b> Calculator</h1>
      <p>Enter   your bond's serial number.</p></body></html>`;
    expect(pageText(html)).toEqual({
      title: "Savings Bond Calculator & More",
      h1: "Savings Bond Calculator",
      text: "Savings Bond Calculator Enter your bond's serial number.",
    });
  });
});

describe("readPage", () => {
  it("reports a page that is not HTML or not reachable", async () => {
    const pdf = (async () =>
      new Response("%PDF", {
        headers: { "content-type": "application/pdf" },
      })) as unknown as typeof fetch;
    expect(await readPage("https://a.com/x.pdf", pdf)).toMatchObject({
      status: 200,
      title: null,
    });
    const down = (async () => {
      throw new Error("timeout");
    }) as unknown as typeof fetch;
    expect((await readPage("https://a.com", down)).status).toBeNull();
  });
});

describe("createGoogleAutocomplete", () => {
  it("returns the suggestions other than the phrase itself", async () => {
    const seen: string[] = [];
    const suggest = createGoogleAutocomplete({
      fetch: (async (url: string) => {
        seen.push(url);
        return Response.json([
          "bond savings calculator",
          ["bond savings calculator", "savings bond calculator not working"],
          [],
          {},
        ]);
      }) as unknown as typeof fetch,
    });
    expect(await suggest("bond savings calculator")).toEqual([
      "savings bond calculator not working",
    ]);
    expect(new URL(seen[0]).searchParams.get("gl")).toBe("us");
  });

  it("gives none on an error", async () => {
    const suggest = createGoogleAutocomplete({
      fetch: (async () =>
        new Response("", { status: 429 })) as unknown as typeof fetch,
    });
    expect(await suggest("x")).toEqual([]);
  });
});
