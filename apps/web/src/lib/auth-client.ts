"use client";
import { createBrowserAuthClient } from "@repo/auth/client";

// Better Auth runs on apps/api (docs/architecture/security.md#auth-on-the-api).
// NEXT_PUBLIC_API_URL is inlined at build time.
export const authClient = createBrowserAuthClient(
  process.env.NEXT_PUBLIC_API_URL ?? "",
);

/** Callback URLs go back to this site; apps/api accepts absolute URLs on its origin only. */
export function siteUrl(path: string) {
  return new URL(path, window.location.origin).href;
}
