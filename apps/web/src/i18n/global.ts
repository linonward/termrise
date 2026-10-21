import type { Locale } from "@repo/config/locale";

import type zh from "../../messages/zh.json";

declare module "next-intl" {
  interface AppConfig {
    Locale: Locale;
    Messages: typeof zh;
  }
}
