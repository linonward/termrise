import { getSessionCookie } from "better-auth/cookies";
import { z } from "zod";

// Only what the web app reads from a session.
const sessionSchema = z
  .object({
    user: z.object({ id: z.string(), email: z.string(), name: z.string() }),
  })
  .nullable();

export type ApiSession = NonNullable<z.infer<typeof sessionSchema>>;

/**
 * Reads a request's session from apps/api (GET /api/auth/get-session), forwarding only
 * its cookies. Without a session cookie there is no call. An API failure throws, so a
 * signed-in user is not treated as signed out.
 */
export function createSessionClient(
  apiUrl: string,
  transport: typeof fetch = fetch,
) {
  return async function getSession(
    headers: Headers,
  ): Promise<ApiSession | null> {
    if (!getSessionCookie(headers)) return null;
    const response = await transport(new URL("/api/auth/get-session", apiUrl), {
      headers: { cookie: headers.get("cookie") ?? "" },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok)
      throw new Error(`Session lookup failed: ${response.status}`);
    return sessionSchema.parse(await response.json());
  };
}
