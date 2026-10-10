import posthog from "posthog-js";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import {
  analyticsConsent,
  chooseConsent,
  identify,
  initAnalytics,
  resetConsent,
  track,
  withPostHog,
} from "./client";

vi.mock("posthog-js", () => ({
  default: {
    init: vi.fn(),
    capture: vi.fn(),
    identify: vi.fn(),
    reset: vi.fn(),
    opt_in_capturing: vi.fn(),
    opt_out_capturing: vi.fn(),
    clear_opt_in_out_capturing: vi.fn(),
  },
}));

const PRODUCT = { productId: "acme", apiUrl: "https://api.test" };

const fetchMock = vi.fn(() => Promise.resolve(new Response()));

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  consented("1");
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

function consented(value: string | undefined, lang?: string) {
  vi.stubGlobal("document", {
    cookie: value === undefined ? "a=1" : `a=1; cookie_consent=${value}`,
    documentElement: { lang },
  });
}

// Lets a pending dynamic import settle before asserting that nothing ran.
const settle = () => new Promise((resolve) => setTimeout(resolve, 10));

it("does nothing until analytics is initialized with a key", () => {
  initAnalytics(undefined, PRODUCT);
  track("landing_viewed");
  expect(posthog.init).not.toHaveBeenCalled();
  expect(posthog.capture).not.toHaveBeenCalled();
});

it("starts opted out, without autocapture, pageviews or recordings", async () => {
  initAnalytics("phc_test", PRODUCT);
  await vi.waitFor(() => expect(posthog.init).toHaveBeenCalled());
  expect(posthog.init).toHaveBeenCalledWith(
    "phc_test",
    expect.objectContaining({
      api_host: "/ingest",
      opt_out_capturing_by_default: true,
      opt_out_persistence_by_default: true,
      opt_out_capturing_persistence_type: "cookie",
      consent_persistence_name: "cookie_consent",
      autocapture: false,
      capture_pageview: false,
      capture_pageleave: false,
      disable_session_recording: true,
      person_profiles: "identified_only",
      advanced_disable_flags: true,
      disable_surveys: true,
    }),
  );
});

it("captures the event with its properties", async () => {
  initAnalytics("phc_test", PRODUCT);
  track("task_started", { inputLength: 5 });
  await vi.waitFor(() => expect(posthog.capture).toHaveBeenCalled());
  expect(posthog.capture).toHaveBeenCalledWith("task_started", {
    inputLength: 5,
    product_id: "acme",
  });
});

it("adds the page locale to every event", async () => {
  consented("1", "zh");
  initAnalytics("phc_test", PRODUCT);
  track("dashboard_viewed");
  await vi.waitFor(() => expect(posthog.capture).toHaveBeenCalled());
  expect(posthog.capture).toHaveBeenCalledWith("dashboard_viewed", {
    locale: "zh",
    product_id: "acme",
  });
});

it("identifies the user with the page locale as a person property", async () => {
  consented("1", "zh");
  initAnalytics("phc_test", PRODUCT);
  identify("user-1");
  await vi.waitFor(() => expect(posthog.identify).toHaveBeenCalled());
  expect(posthog.identify).toHaveBeenCalledWith("user-1", { locale: "zh" });
});

it("drops emails and prompts from event properties", async () => {
  initAnalytics("phc_test", PRODUCT);
  track("signup_started", {
    method: "email",
    email: "a@example.com",
    prompt: "full prompt",
  } as never);
  await vi.waitFor(() => expect(posthog.capture).toHaveBeenCalled());
  expect(posthog.capture).toHaveBeenCalledWith("signup_started", {
    method: "email",
    product_id: "acme",
  });
});

it("adds the product id to every event; callers cannot override it", async () => {
  initAnalytics("phc_test", PRODUCT);
  track("pricing_viewed", { product_id: "other" });
  await vi.waitFor(() => expect(posthog.capture).toHaveBeenCalled());
  expect(posthog.capture).toHaveBeenCalledWith("pricing_viewed", {
    product_id: "acme",
  });
});

it("keeps the order of events tracked before the SDK has loaded", async () => {
  initAnalytics("phc_test", PRODUCT);
  track("landing_viewed");
  track("signup_started", { method: "google" });
  await vi.waitFor(() => expect(posthog.capture).toHaveBeenCalledTimes(2));
  expect(vi.mocked(posthog.capture).mock.calls.map(([event]) => event)).toEqual(
    ["landing_viewed", "signup_started"],
  );
  expect(posthog.init).toHaveBeenCalledBefore(vi.mocked(posthog.capture));
});

it("runs SDK calls from components after init", async () => {
  initAnalytics("phc_test", PRODUCT);
  withPostHog((ph) => ph.reset());
  await vi.waitFor(() => expect(posthog.reset).toHaveBeenCalled());
  expect(posthog.init).toHaveBeenCalledBefore(vi.mocked(posthog.reset));
});

it("does not load the SDK before the visitor accepts", async () => {
  consented(undefined);
  initAnalytics("phc_test", PRODUCT);
  track("landing_viewed");
  identify("user-1");
  await settle();
  expect(posthog.init).not.toHaveBeenCalled();
  expect(analyticsConsent()).toBeUndefined();
});

it("does not load the SDK after the visitor declines", async () => {
  consented("0");
  initAnalytics("phc_test", PRODUCT);
  track("landing_viewed");
  await settle();
  expect(posthog.init).not.toHaveBeenCalled();
  expect(analyticsConsent()).toBe(false);
});

it("loads the SDK to store the choice and saves it for server events", async () => {
  consented(undefined);
  initAnalytics("phc_test", PRODUCT);
  chooseConsent(true);
  await vi.waitFor(() => expect(posthog.opt_in_capturing).toHaveBeenCalled());
  expect(posthog.init).toHaveBeenCalledBefore(
    vi.mocked(posthog.opt_in_capturing),
  );
  expect(document.cookie).toBe(
    "cookie_consent=1; Path=/; Max-Age=31536000; SameSite=Lax",
  );
  expect(fetchMock).toHaveBeenCalledWith(
    new URL("https://api.test/api/analytics/consent"),
    expect.objectContaining({
      credentials: "include",
      body: JSON.stringify({ granted: true }),
    }),
  );

  chooseConsent(false);
  await vi.waitFor(() => expect(posthog.opt_out_capturing).toHaveBeenCalled());
});

it("identifies a signed-in user who accepts on the current page", async () => {
  consented(undefined, "en");
  initAnalytics("phc_test", PRODUCT);
  // IdentifyUser runs on mount, before the visitor has chosen: nothing loads yet.
  identify("user-2");
  await settle();
  expect(posthog.identify).not.toHaveBeenCalled();

  chooseConsent(true);
  await vi.waitFor(() =>
    expect(posthog.identify).toHaveBeenCalledWith("user-2", { locale: "en" }),
  );
  expect(posthog.opt_in_capturing).toHaveBeenCalledBefore(
    vi.mocked(posthog.identify),
  );
});

it("loads the SDK to clear the choice when the banner reopens", async () => {
  consented("0");
  initAnalytics("phc_test", PRODUCT);
  resetConsent();
  expect(document.cookie).toBe(
    "cookie_consent=; Path=/; Max-Age=0; SameSite=Lax",
  );
  await vi.waitFor(() =>
    expect(posthog.clear_opt_in_out_capturing).toHaveBeenCalled(),
  );
});
