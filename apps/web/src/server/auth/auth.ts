import "server-only";
import { headers } from "next/headers";
import { cache } from "react";

import { createSessionClient } from "@repo/auth/session-client";
import { serverEnv } from "@repo/config/env";

// apps/api serves Better Auth (docs/architecture/security.md#auth-on-the-api); the web app
// only reads sessions from it over HTTP and never touches the auth tables.
let instance: ReturnType<typeof createSessionClient> | undefined;
export function getSession(headers: Headers) {
  instance ??= createSessionClient(serverEnv().NEXT_PUBLIC_API_URL);
  return instance(headers);
}
/** Session of the current request. The dashboard layout and page share one lookup. */
export const getRequestSession = cache(async () => getSession(await headers()));
