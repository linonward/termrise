"use client";
import { SpeedInsights as VercelSpeedInsights } from "@vercel/speed-insights/next";

import { redactEvent } from "@repo/analytics/web-analytics";

// Cookieless Web Vitals per page (docs/architecture/observability.md#speed-insights).
export function SpeedInsights() {
  return <VercelSpeedInsights beforeSend={redactEvent} />;
}
