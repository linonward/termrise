import type { Locale } from "@repo/config/locale";

import en from "../messages/en.json";
import zh from "../messages/zh.json";

// Copy the API itself sends (auth emails); page copy stays in apps/web/messages.
export const messages: Record<Locale, typeof en> = { en, zh };
