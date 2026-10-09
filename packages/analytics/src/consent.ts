/** First-party consent cookie written by PostHog: "1" accepted, "0" declined. */
export const CONSENT_COOKIE = "cookie_consent";

/** The cookie banner choice from a Cookie header: true, false, or undefined if none. */
export function consentFromCookies(header: string | null | undefined) {
  const value = header
    ?.split(";")
    .map((part) => part.trim().split("="))
    .find(([name]) => name === CONSENT_COOKIE)?.[1];
  return value === "1" ? true : value === "0" ? false : undefined;
}
