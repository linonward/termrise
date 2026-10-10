"use client";
import { magicLinkClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

/** Browser client for Better Auth on apps/api; the app passes the API's URL. */
export function createBrowserAuthClient(baseURL: string) {
  return createAuthClient({ baseURL, plugins: [magicLinkClient()] });
}
