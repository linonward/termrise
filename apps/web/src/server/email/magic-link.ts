import type { MagicLinkDelivery } from "@repo/auth/create-auth";
import { sendMagicLinkEmail as send } from "@repo/auth/magic-link-email";
import { localeFromHeaders } from "@repo/config/locale";

import { messages } from "@/i18n/messages";

export async function sendMagicLinkEmail(
  input: MagicLinkDelivery,
  config: { apiKey: string; from: string },
) {
  const locale = localeFromHeaders(input.request?.headers ?? new Headers());
  await send(input, { ...config, copy: messages[locale].auth });
}
