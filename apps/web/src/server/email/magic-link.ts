import type { MagicLinkDelivery } from "@repo/auth/create-auth";

import { localeFromHeaders } from "@/i18n/locale";
import { messages } from "@/i18n/messages";

export async function sendMagicLinkEmail(
  input: MagicLinkDelivery,
  config: { apiKey: string; from: string },
  transport: typeof fetch = fetch,
) {
  const copy =
    messages[localeFromHeaders(input.request?.headers ?? new Headers())].auth;
  const response = await transport("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: config.from,
      to: [input.email],
      subject: copy.emailSubject,
      text: `${copy.emailBody}\n\n${input.url}`,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  // Never forward provider payloads: they may include private contact details.
  if (!response.ok) throw new Error("Magic link delivery failed");
}
