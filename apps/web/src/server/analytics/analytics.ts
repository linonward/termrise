import "server-only";
import { after } from "next/server";

import { createAnalyticsService } from "@repo/analytics/analytics-service";
import { db } from "@repo/db/client";

import product from "@product";

import { getAnalyticsProvider } from "./provider";

export function getAnalyticsService() {
  return createAnalyticsService({
    database: db(),
    provider: getAnalyticsProvider(),
    productId: product.id,
    // After the response is sent; Vercel keeps the function alive until it finishes.
    defer: (task) => after(task),
  });
}
