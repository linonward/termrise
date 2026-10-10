import type { MagicLinkDelivery } from "./create-auth";

/** The app picks the copy in the user's language from its messages. */
export type MagicLinkCopy = { emailSubject: string; emailBody: string };

// Plain text through Resend's HTTP API (fetch works in Node and Cloudflare Workers).
export async function sendMagicLinkEmail(
  input: Pick<MagicLinkDelivery, "email" | "url">,
  config: { apiKey: string; from: string; copy: MagicLinkCopy },
  transport: typeof fetch = fetch,
) {
  const response = await transport("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: config.from,
      to: [input.email],
      subject: config.copy.emailSubject,
      text: `${config.copy.emailBody}\n\n${input.url}`,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  // Never forward provider payloads: they may include private contact details.
  if (!response.ok) throw new Error("Magic link delivery failed");
}
