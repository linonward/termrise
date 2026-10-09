import { eq } from "drizzle-orm";
import { z } from "zod";

import type { Database } from "@repo/db/client";
import { analyticsConsents } from "@repo/db/schema";
import { AppError } from "@repo/observability/errors";
import { logger } from "@repo/observability/logger";

import type {
  AnalyticsProperties,
  AnalyticsProvider,
  ServerAnalyticsEvent,
} from "./types";

// Never sent: full prompts and emails.
const FORBIDDEN = new Set(["email", "prompt"]);

const consentBody = z.object({ granted: z.boolean() });

export function createAnalyticsService(deps: {
  database: Pick<Database, "select" | "insert">;
  provider: AnalyticsProvider;
  /** Sent as product_id on every event: products share one PostHog project. */
  productId: string;
  /** Runs capture work; the app passes next/server after() so responses do not wait. */
  defer?: (task: () => Promise<void>) => void | Promise<void>;
}) {
  const { database, provider, productId, defer = (task) => task() } = deps;

  async function setConsent(userId: string, granted: boolean) {
    await database
      .insert(analyticsConsents)
      .values({ userId, granted })
      .onConflictDoUpdate({
        target: analyticsConsents.userId,
        set: { granted, updatedAt: new Date() },
      });
  }

  /** POST /api/analytics/consent body. */
  async function updateConsent(userId: string, body: unknown) {
    const parsed = consentBody.safeParse(body);
    if (!parsed.success)
      throw new AppError("INVALID_INPUT", "granted must be a boolean");
    await setConsent(userId, parsed.data.granted);
  }

  /** Sends only for users who accepted analytics; never throws. */
  async function capture(
    userId: string,
    event: ServerAnalyticsEvent,
    properties: AnalyticsProperties = {},
  ) {
    await defer(() => send(userId, event, properties));
  }

  async function send(
    userId: string,
    event: ServerAnalyticsEvent,
    properties: AnalyticsProperties,
  ) {
    try {
      const [consent] = await database
        .select({ granted: analyticsConsents.granted })
        .from(analyticsConsents)
        .where(eq(analyticsConsents.userId, userId));
      if (!consent?.granted) return;
      await provider.capture({
        distinctId: userId,
        event,
        properties: {
          ...Object.fromEntries(
            Object.entries(properties).filter(([key]) => !FORBIDDEN.has(key)),
          ),
          product_id: productId,
        },
      });
    } catch (error) {
      logger.warn("analytics.capture_failed", { userId, event, error });
    }
  }

  return { setConsent, updateConsent, capture };
}

export type AnalyticsService = ReturnType<typeof createAnalyticsService>;

/** Default for services created without analytics (most tests). */
export const noAnalytics: AnalyticsService = {
  setConsent: async () => {},
  updateConsent: async () => {},
  capture: async () => {},
};
