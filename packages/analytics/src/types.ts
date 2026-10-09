// Server-side analytics events (docs/architecture/observability.md#analytics).
export type ServerAnalyticsEvent =
  "signup_completed" | "purchase_completed" | "task_succeeded" | "task_failed";

export type AnalyticsProperties = Record<string, string | number | boolean>;

export type AnalyticsCapture = {
  distinctId: string;
  event: ServerAnalyticsEvent;
  properties: AnalyticsProperties;
};

export interface AnalyticsProvider {
  capture(input: AnalyticsCapture): Promise<void>;
}
