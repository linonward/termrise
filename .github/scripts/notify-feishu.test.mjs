import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { messageBody, notify, sign } from "./notify-feishu.mjs";

const reply = (status, body) => async () =>
  new Response(JSON.stringify(body), { status });

describe("messageBody", () => {
  it("sends plain text without a secret", () => {
    expect(messageBody("hi")).toEqual({
      msg_type: "text",
      content: { text: "hi" },
    });
  });

  it("adds the timestamp in seconds and its signature with a secret", () => {
    const body = messageBody("hi", { secret: "s", now: 1_700_000_000_999 });
    expect(body.timestamp).toBe("1700000000");
    expect(body.sign).toBe(
      createHmac("sha256", "1700000000\ns").update("").digest("base64"),
    );
    expect(body.sign).toBe(sign("1700000000", "s"));
  });
});

describe("notify", () => {
  it("posts JSON to the webhook", async () => {
    const calls = [];
    await notify("hi", {
      url: "https://open.feishu.cn/open-apis/bot/v2/hook/x",
      fetch: async (url, init) => {
        calls.push({ url, init });
        return reply(200, { code: 0, msg: "success", data: {} })();
      },
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].init.method).toBe("POST");
    expect(JSON.parse(calls[0].init.body)).toEqual({
      msg_type: "text",
      content: { text: "hi" },
    });
  });

  it("fails on a non-zero code even with HTTP 200", async () => {
    await expect(
      notify("hi", {
        url: "https://example.test",
        fetch: reply(200, { code: 19024, msg: "Key Words Not Found" }),
      }),
    ).rejects.toThrow("code 19024, Key Words Not Found");
  });

  it("fails on an HTTP error", async () => {
    await expect(
      notify("hi", { url: "https://example.test", fetch: reply(500, {}) }),
    ).rejects.toThrow("HTTP 500");
  });
});
