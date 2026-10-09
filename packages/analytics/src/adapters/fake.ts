import type { AnalyticsCapture, AnalyticsProvider } from "../types";

// Records events in memory; tests and environments without a PostHog key.
export function createFakeAnalyticsProvider() {
  const events: AnalyticsCapture[] = [];
  const provider = {
    events,
    /** Makes the next captures throw. */
    fail: false as boolean,
    async capture(input: AnalyticsCapture) {
      if (provider.fail) throw new Error("analytics provider failed");
      events.push(input);
    },
  } satisfies AnalyticsProvider & { events: AnalyticsCapture[]; fail: boolean };
  return provider;
}
