import { afterEach, expect, it, vi } from "vitest";

import { sendMagicLinkEmail } from "./magic-link";

afterEach(() => vi.unstubAllGlobals());

it("sends the copy in the request's language", async () => {
  const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response("{}"));
  vi.stubGlobal("fetch", transport);
  await sendMagicLinkEmail(
    {
      email: "test@example.com",
      url: "https://example.com/verify?token=test",
      request: new Request("https://example.com", {
        headers: { cookie: "NEXT_LOCALE=zh" },
      }),
    },
    { apiKey: "test-key", from: "test@example.com" },
  );
  const [, init] = transport.mock.calls[0];
  expect(JSON.parse(init!.body as string).subject).toBe("你的 Acme 登录链接");
});
