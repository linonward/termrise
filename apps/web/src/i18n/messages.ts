import type { Locale } from "./locale";
import en from "../../messages/en.json";
import zh from "../../messages/zh.json";

export const messages: Record<Locale, typeof en> = { en, zh };
