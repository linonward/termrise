import { expect, it, vi } from "vitest";

import { sendMagicLinkEmail } from "./magic-link";

it("sends the localized message through Resend without HTML interpolation", async () => {
  const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response("{}"));
  await sendMagicLinkEmail(
    {
      email: "test@example.com",
      url: "https://example.com/verify?token=test",
      request: new Request("https://example.com", {
        headers: { cookie: "NEXT_LOCALE=zh" },
      }),
    },
    { apiKey: "test-key", from: "test@example.com" },
    transport,
  );
  const [url, init] = transport.mock.calls[0];
  expect(url).toBe("https://api.resend.com/emails");
  expect(JSON.parse(init!.body as string)).toMatchObject({
    subject: "你的 Acme 登录链接",
    to: ["test@example.com"],
  });
});
it("does not expose a rejected provider response", async () => {
  const transport = vi
    .fn<typeof fetch>()
    .mockResolvedValue(
      new Response("private-email@example.com", { status: 422 }),
    );
  await expect(
    sendMagicLinkEmail(
      { email: "test@example.com", url: "https://example.com" },
      { apiKey: "test-key", from: "test@example.com" },
      transport,
    ),
  ).rejects.toThrow("Magic link delivery failed");
});
