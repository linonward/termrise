import { expect, it, vi } from "vitest";

import { sendMagicLinkEmail } from "./magic-link-email";

const config = {
  apiKey: "test-key",
  from: "test@example.com",
  copy: { emailSubject: "你的登录链接", emailBody: "点击以下链接登录。" },
};

it("sends the given copy through Resend as plain text", async () => {
  const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response("{}"));
  await sendMagicLinkEmail(
    { email: "test@example.com", url: "https://example.com/verify?token=t" },
    config,
    transport,
  );
  const [url, init] = transport.mock.calls[0];
  expect(url).toBe("https://api.resend.com/emails");
  expect(JSON.parse(init!.body as string)).toEqual({
    from: "test@example.com",
    to: ["test@example.com"],
    subject: "你的登录链接",
    text: "点击以下链接登录。\n\nhttps://example.com/verify?token=t",
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
      config,
      transport,
    ),
  ).rejects.toThrow("Magic link delivery failed");
});
