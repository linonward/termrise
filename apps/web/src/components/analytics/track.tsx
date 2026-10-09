"use client";
import { useEffect } from "react";

import {
  analyticsConsent,
  analyticsEnabled,
  identify,
  saveConsent,
  track,
  type AnalyticsEvent,
} from "@repo/analytics/client";

/** Captures a page-level event once per mount. */
export function TrackView({ event }: { event: AnalyticsEvent }) {
  useEffect(() => track(event), [event]);
  return null;
}

/** Links analytics to the internal user id (never the email) and syncs a choice made while signed out. */
export function IdentifyUser({ userId }: { userId: string }) {
  useEffect(() => {
    if (!analyticsEnabled()) return;
    identify(userId);
    const consent = analyticsConsent();
    if (consent !== undefined) saveConsent(consent);
  }, [userId]);
  return null;
}

/** A plain link that captures an event when clicked. */
export function TrackedLink({
  event,
  ...props
}: React.ComponentProps<"a"> & { event: AnalyticsEvent }) {
  return <a {...props} onClick={() => track(event)} />;
}
