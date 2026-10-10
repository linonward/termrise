import "server-only";
import { headers } from "next/headers";
import { cache } from "react";

import { AuthError } from "@repo/auth/guards";
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
/**
 * Session of the current request when the user is in ADMIN_USER_IDS, else null.
 * Callers answer 404 so /admin does not reveal that it exists
 * (docs/architecture/security.md#admin-access).
 */
export const getAdminSession = cache(async () => {
  const session = await getRequestSession();
  return session && serverEnv().ADMIN_USER_IDS.includes(session.user.id)
    ? session
    : null;
});
export async function requireUser(headers: Headers) {
  const session = await getSession(headers);
  if (!session) throw new AuthError("UNAUTHORIZED", 401);
  return session.user;
}
