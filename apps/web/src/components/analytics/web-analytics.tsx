"use client";
import { Analytics } from "@vercel/analytics/next";

import { redactEvent } from "@repo/analytics/web-analytics";

// Cookieless page views for traffic sources (docs/architecture/observability.md#web-analytics).
export function WebAnalytics() {
  return <Analytics beforeSend={redactEvent} />;
}
