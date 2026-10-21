import { getRequestConfig } from "next-intl/server";

import { LOCALE } from "@repo/config/locale";

import { messages } from "./messages";

export default getRequestConfig(async () => ({ locale: LOCALE, messages }));
