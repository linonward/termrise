import { describe, expect, it, vi } from "vitest";

import { createDeepSeekProvider } from "./deepseek";

function respond(status: number, body: unknown) {
  return vi.fn<typeof fetch>(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
  );
}

function completion(content: string | null, finishReason = "stop") {
  return {
    id: "cmpl-1",
    object: "chat.completion",
    created: 1,
    model: "test-model",
    choices: [
      {
        index: 0,
        message: { role: "assistant", content },
        finish_reason: finishReason,
      },
    ],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  };
}

describe("deepseek provider", () => {
  it("sends the input to DeepSeek and returns the answer", async () => {
    const fetch = respond(200, completion("Hello"));
    const provider = createDeepSeekProvider({
      apiKey: "sk-test",
      model: "test-model",
      instructions: "Be brief.",
      fetch,
    });

    expect(await provider.run("hi")).toEqual({ output: "Hello" });
    const [url, init] = fetch.mock.calls[0]!;
    expect(String(url)).toBe("https://api.deepseek.com/chat/completions");
    expect(new Headers(init?.headers).get("authorization")).toBe(
      "Bearer sk-test",
    );
    expect(JSON.parse(init?.body as string)).toMatchObject({
      model: "test-model",
      messages: [
        { role: "system", content: "Be brief." },
        { role: "user", content: "hi" },
      ],
    });
  });

  it("fails on an HTTP error without the prompt or response body", async () => {
    const provider = createDeepSeekProvider({
      apiKey: "k",
      model: "m",
      fetch: respond(402, { error: { message: "secret detail" } }),
    });
    const error = await provider.run("my private prompt").catch((e) => e);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toContain("402");
    expect(error.cause).toBeUndefined();
    const dump = JSON.stringify({ ...error, message: error.message });
    expect(dump).not.toContain("my private prompt");
    expect(dump).not.toContain("secret detail");
  });

  it("caps the answer length", async () => {
    const fetch = respond(200, completion("Hello"));
    const provider = createDeepSeekProvider({ apiKey: "k", model: "m", fetch });
    await provider.run("hi");
    expect(JSON.parse(fetch.mock.calls[0]![1]?.body as string)).toMatchObject({
      max_tokens: 2048,
    });
  });

  // The provider bills the tokens, so a cut answer is a charged success, not a refund.
  it("returns an answer cut at the length cap", async () => {
    const provider = createDeepSeekProvider({
      apiKey: "k",
      model: "m",
      fetch: respond(200, completion("Hel", "length")),
    });
    expect(await provider.run("hi")).toEqual({ output: "Hel" });
  });

  it("fails when the answer did not finish", async () => {
    const provider = createDeepSeekProvider({
      apiKey: "k",
      model: "m",
      fetch: respond(200, completion("Hel", "content_filter")),
    });
    await expect(provider.run("hi")).rejects.toThrow(/content-filter/);
  });

  it("fails when the answer is empty", async () => {
    const provider = createDeepSeekProvider({
      apiKey: "k",
      model: "m",
      fetch: respond(200, completion("")),
    });
    await expect(provider.run("hi")).rejects.toThrow(/no text/);
  });
});
