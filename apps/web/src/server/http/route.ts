import { withRequestContext } from "@repo/observability/logger";

import type { ApiRateLimitName as RateLimitName } from "./rate-limits";
import { errorResponse } from "./respond";

type Options = {
  /**
   * Checked per user before the handler. A name uses the key `{name}:{userId}`;
   * `{ limit, key }` shares a limit under another key, e.g. `subscription-cancel`.
   */
  rateLimit?: RateLimitName | { limit: RateLimitName; key: string };
};

type Handler<U> = (context: { request: Request; user: U }) => Promise<Response>;

// The steps every signed-in API route repeats: request id for logs, session,
// rate limit, and the error contract (docs/architecture/api.md#error-contract).
export function createUserRoute<U extends { id: string }>(deps: {
  requireUser: (headers: Headers) => Promise<U>;
  enforceRateLimit: (limit: RateLimitName, key: string) => Promise<void>;
}) {
  function userRoute(
    handler: Handler<U>,
  ): (request: Request) => Promise<Response>;
  function userRoute(
    options: Options,
    handler: Handler<U>,
  ): (request: Request) => Promise<Response>;
  function userRoute(a: Options | Handler<U>, b?: Handler<U>) {
    const [options, handler] =
      typeof a === "function" ? [{} as Options, a] : [a, b!];
    return withRequestContext(async (request: Request) => {
      try {
        const user = await deps.requireUser(request.headers);
        if (options.rateLimit) {
          const { limit, key } =
            typeof options.rateLimit === "string"
              ? { limit: options.rateLimit, key: options.rateLimit }
              : options.rateLimit;
          await deps.enforceRateLimit(limit, `${key}:${user.id}`);
        }
        return await handler({ request, user });
      } catch (error) {
        return errorResponse(error);
      }
    });
  }
  return userRoute;
}
