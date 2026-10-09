export const locales = ["en", "zh"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";
export const LOCALE_COOKIE = "NEXT_LOCALE";

export function isLocale(value: unknown): value is Locale {
  return locales.includes(value as Locale);
}

// Priority: NEXT_LOCALE cookie → Accept-Language → en (docs/product/ux.md#internationalization).
export function resolveLocale(
  cookie: string | undefined,
  acceptLanguage: string | null,
): Locale {
  if (isLocale(cookie)) return cookie;
  const accepted = (acceptLanguage ?? "")
    .split(",")
    .map((part) => {
      const [tag, quality] = part.trim().split(";");
      return {
        language: tag.toLowerCase().split("-")[0],
        quality: quality ? Number(quality.trim().replace(/^q=/, "")) : 1,
      };
    })
    .filter((item) => item.quality > 0)
    .sort((a, b) => b.quality - a.quality)
    .find((item) => isLocale(item.language));
  return (accepted?.language as Locale | undefined) ?? defaultLocale;
}

export function localeFromHeaders(headers: Headers): Locale {
  const cookie = headers
    .get("cookie")
    ?.match(new RegExp(`(?:^|;\\s*)${LOCALE_COOKIE}=([^;]*)`))?.[1];
  return resolveLocale(cookie, headers.get("accept-language"));
}
