import type { MetadataRoute } from "next";

import { serverEnv } from "@repo/config/env";

// APP_URL is read per request: it differs per deployment and is not set at build time.
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/dashboard",
        "/billing",
        "/radar",
        "/research",
        "/opportunities",
        "/projects",
        "/settings",
        "/api",
      ],
    },
    sitemap: new URL("/sitemap.xml", serverEnv().APP_URL).href,
  };
}
