import type { PostHog } from "posthog-js";

import { CONSENT_COOKIE, consentFromCookies } from "./consent";

// Client analytics (docs/architecture/observability.md#analytics). Nothing is sent and no
// cookie is set until the visitor accepts the cookie banner. posthog-js is loaded with a
// dynamic import only after the visitor accepts (or to store a banner choice), so a
// visitor without consent never downloads it; calls made while it loads run afterwards,
// in order.
export type AnalyticsEvent =
  | "landing_viewed"
  | "pricing_viewed"
  | "signup_started"
  | "dashboard_viewed"
  | "task_started"
  | "checkout_started"
  | "credits_exhausted";

type Properties = Record<string, string | number | boolean>;

// Never sent: full prompts and emails.
const FORBIDDEN = new Set(["email", "prompt"]);

let enabled = false;
let posthogKey: string | undefined;
let productId = "";
let client: Promise<PostHog> | undefined;
// The signed-in user: identify() runs on mount, often before the visitor accepts and the
// SDK loads, so accepting on the same page identifies again.
let userId: string | undefined;

/** `productId` goes on every event: products share one PostHog project. */
export function initAnalytics(
  key: string | undefined,
  options: { productId: string },
) {
  if (!key) return;
  enabled = true;
  posthogKey = key;
  productId = options.productId;
  client = undefined;
  if (analyticsConsent()) loadPostHog();
}

function loadPostHog() {
  const key = posthogKey;
  if (!key) return undefined;
  client ??= import("posthog-js").then(({ default: posthog }) => {
    init(posthog, key);
    return posthog;
  });
  return client;
}

function init(posthog: PostHog, key: string) {
  posthog.init(key, {
    api_host: "/ingest",
    ui_host: "https://us.posthog.com",
    defaults: "2026-05-30",
    opt_out_capturing_by_default: true,
    opt_out_persistence_by_default: true,
    opt_out_capturing_persistence_type: "cookie",
    consent_persistence_name: CONSENT_COOKIE,
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    disable_session_recording: true,
    person_profiles: "identified_only",
    // No feature flags, surveys or remote config: no request before consent.
    advanced_disable_flags: true,
    disable_surveys: true,
  });
}

/** Runs `fn` with the SDK once it has loaded; does nothing if the SDK is not loaded or loading. */
export function withPostHog(fn: (posthog: PostHog) => void) {
  void client?.then(fn).catch(() => {});
}

/** The cookie banner choice: true, false, or undefined if the visitor has not chosen. */
export function analyticsConsent() {
  return consentFromCookies(globalThis.document?.cookie);
}

/** Stores the banner choice in the PostHog consent cookie and for server-side events. */
export function chooseConsent(granted: boolean) {
  // Written now as well: the visitor can leave the page before the SDK loads.
  writeConsentCookie(granted ? "1" : "0");
  void loadPostHog()
    ?.then((posthog) => {
      if (!granted) return posthog.opt_out_capturing();
      posthog.opt_in_capturing();
      if (userId) posthog.identify(userId, pageLocale());
    })
    .catch(() => {});
  saveConsent(granted);
}

/** Clears the banner choice so the visitor can choose again. */
export function resetConsent() {
  writeConsentCookie(null);
  void loadPostHog()
    ?.then((posthog) => posthog.clear_opt_in_out_capturing())
    .catch(() => {});
}

// Same name and values as the PostHog consent cookie; null deletes it.
function writeConsentCookie(value: "1" | "0" | null) {
  if (!globalThis.document) return;
  const maxAge = value === null ? 0 : 365 * 24 * 60 * 60;
  const secure = globalThis.location?.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${CONSENT_COOKIE}=${value ?? ""}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`;
}

/** Stores the choice for server-side events; signed-out visitors get 401, which is ignored. */
export function saveConsent(granted: boolean) {
  void fetch("/api/analytics/consent", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ granted }),
  }).catch(() => {});
}

export function analyticsEnabled() {
  return enabled;
}

// <html lang> is the resolved UI locale (src/app/layout.tsx).
function pageLocale(): Properties {
  const locale = globalThis.document?.documentElement.lang;
  return locale ? { locale } : {};
}

export function track(event: AnalyticsEvent, properties: Properties = {}) {
  if (!enabled) return;
  const safe = Object.fromEntries(
    Object.entries(properties).filter(([key]) => !FORBIDDEN.has(key)),
  );
  withPostHog((posthog) =>
    posthog.capture(event, {
      ...safe,
      ...pageLocale(),
      product_id: productId,
    }),
  );
}

/** Links events to the internal user id; locale becomes a person property, so server events can be split by it. */
export function identify(id: string) {
  userId = id;
  withPostHog((posthog) => posthog.identify(id, pageLocale()));
}
