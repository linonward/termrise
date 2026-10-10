import { expect, it, vi } from "vitest";

import { createDeepSeekJson } from "./deepseek-json";

// A stub fetch with the chat completion shape of the DeepSeek API: no network call.
function respond(status: number, body: unknown) {
  return vi.fn<typeof fetch>(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
  );
}

const completion = (content: string) => ({
  id: "cmpl-1",
  object: "chat.completion",
  created: 1,
  model: "deepseek-flash",
  choices: [
    {
      index: 0,
      message: { role: "assistant", content },
      finish_reason: "stop",
    },
  ],
  usage: {
    prompt_tokens: 1000,
    completion_tokens: 300,
    total_tokens: 1300,
    prompt_cache_hit_tokens: 200,
    prompt_cache_miss_tokens: 800,
  },
});

const input = {
  instructions: "Answer in json.",
  prompt: "data",
  maxOutputTokens: 1500,
};

it("asks for a JSON object without thinking and returns it with the billed tokens", async () => {
  const fetch = respond(200, completion('{"targetUser":"devs"}'));
  const client = createDeepSeekJson({
    apiKey: "sk-test",
    model: "deepseek-flash",
    fetch,
  });
  expect(await client.generate(input)).toEqual({
    value: { targetUser: "devs" },
    usage: { cacheHitTokens: 200, cacheMissTokens: 800, outputTokens: 300 },
  });
  expect(fetch).toHaveBeenCalledTimes(1);
  const body = JSON.parse(fetch.mock.calls[0]![1]?.body as string);
  expect(body).toMatchObject({
    model: "deepseek-flash",
    max_tokens: 1500,
    response_format: { type: "json_object" },
    thinking: { type: "disabled" },
  });
  expect(body.messages.at(-1)).toEqual({ role: "user", content: "data" });
});

it("fails once, without a retry, and without the prompt in the error", async () => {
  const fetch = respond(500, { error: { message: "secret detail" } });
  const client = createDeepSeekJson({ apiKey: "k", model: "m", fetch });
  const error: Error = await client
    .generate({ ...input, prompt: "my private prompt" })
    .then(
      () => new Error("expected a failure"),
      (e: Error) => e,
    );
  expect(error.message).toContain("500");
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(JSON.stringify({ ...error, m: error.message })).not.toContain(
    "my private prompt",
  );
});

it("fails on an answer that is not JSON", async () => {
  const client = createDeepSeekJson({
    apiKey: "k",
    model: "m",
    fetch: respond(200, completion("not json")),
  });
  await expect(client.generate(input)).rejects.toThrow("DeepSeek");
});
