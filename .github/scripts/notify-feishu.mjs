// Sends one text message to a Feishu custom bot (docs/workflow.md#dependency-checks).
// Run: FEISHU_WEBHOOK_URL=… [FEISHU_WEBHOOK_SECRET=…] node .github/scripts/notify-feishu.mjs "<text>"
// API: https://open.feishu.cn/document/client-docs/bot-v3/add-custom-bot
import { createHmac } from "node:crypto";
import { pathToFileURL } from "node:url";

/** Signature check: HMAC-SHA256 keyed with `timestamp + "\n" + secret` over an empty message. */
export function sign(timestamp, secret) {
  return createHmac("sha256", `${timestamp}\n${secret}`)
    .update(Buffer.alloc(0))
    .digest("base64");
}

export function messageBody(text, { secret, now = Date.now() } = {}) {
  const body = { msg_type: "text", content: { text } };
  if (!secret) return body;
  const timestamp = String(Math.floor(now / 1000));
  return { timestamp, sign: sign(timestamp, secret), ...body };
}

export async function notify(text, { url, secret, fetch = globalThis.fetch }) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(messageBody(text, { secret })),
  });
  // Feishu answers HTTP 200 with a non-zero code for bad signatures, missing keywords and rate limits.
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.code !== 0)
    throw new Error(
      `Feishu rejected the message: HTTP ${response.status}, code ${result.code}, ${result.msg}`,
    );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const url = process.env.FEISHU_WEBHOOK_URL;
  const text = process.argv[2];
  if (!url || !text) {
    console.error(
      'Usage: FEISHU_WEBHOOK_URL=… node .github/scripts/notify-feishu.mjs "<text>"',
    );
    process.exit(1);
  }
  notify(text, { url, secret: process.env.FEISHU_WEBHOOK_SECRET }).catch(
    (error) => {
      // Never print the URL: it is the bot's credential.
      console.error(error.message);
      process.exit(1);
    },
  );
}
