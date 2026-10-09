import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware, isAPIError } from "better-auth/api";
import { lastLoginMethod, magicLink, oneTap } from "better-auth/plugins";

import type { Database } from "@repo/db/client";
import * as schema from "@repo/db/schema/auth";
import { logger } from "@repo/observability/logger";

import { safeNext } from "./auth-redirect";
import {
  LAST_LOGIN_METHOD_COOKIE,
  resolveOneTapLoginMethod,
} from "./last-login-method";

export type AuthConfig = {
  /** Product name; Better Auth uses it, e.g. as the passkey / TOTP issuer. */
  appName: string;
  baseURL: string;
  secret: string;
  googleClientId: string;
  googleClientSecret: string;
};
export type MagicLinkDelivery = {
  email: string;
  url: string;
  request?: Request;
};

/**
 * Runs once after a new user row is created, with the sign-up request (cookies included).
 * The app grants the signup bonus and records analytics consent here.
 */
export type OnUserCreated = (
  user: { id: string },
  request?: Request,
) => Promise<void>;

export function createAuth(
  database: Database,
  config: AuthConfig,
  send: (input: MagicLinkDelivery) => Promise<void>,
  onUserCreated: OnUserCreated = async () => {},
) {
  return betterAuth({
    appName: config.appName,
    baseURL: config.baseURL,
    secret: config.secret,
    database: drizzleAdapter(database, { provider: "pg", schema }),
    trustedOrigins: [new URL(config.baseURL).origin],
    // Provider diagnostics can contain email addresses or tokens.
    logger: { disabled: true },
    // Without this, better-call prints unhandled errors raw with console.error and
    // no Sentry event is sent. A failed query lists its params, which can hold an email.
    onAPIError: {
      onError: (error) => {
        if (isAPIError(error)) return;
        logger.error("auth.unhandled_error", { error: withoutMessage(error) });
        // An APIError makes better-call answer a plain 500 without logging again.
        throw new APIError("INTERNAL_SERVER_ERROR");
      },
    },
    databaseHooks: {
      user: {
        create: {
          after: async (createdUser, context) => {
            await onUserCreated(createdUser, context?.request);
          },
        },
      },
    },
    socialProviders: {
      google: {
        clientId: config.googleClientId,
        clientSecret: config.googleClientSecret,
      },
    },
    user: {
      additionalFields: {
        creditBalance: {
          type: "number",
          required: false,
          defaultValue: 0,
          input: false,
        },
      },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (
          ctx.path !== "/sign-in/magic-link" &&
          ctx.path !== "/sign-in/social" &&
          ctx.path !== "/one-tap/callback"
        )
          return;
        for (const field of [
          "callbackURL",
          "newUserCallbackURL",
          "errorCallbackURL",
        ]) {
          const value = ctx.body?.[field];
          if (
            value !== undefined &&
            (typeof value !== "string" || value !== safeNext(value))
          ) {
            throw new APIError("BAD_REQUEST", {
              message: "Invalid callback URL",
            });
          }
        }
      }),
    },
    plugins: [
      magicLink({
        expiresIn: 300,
        storeToken: "hashed",
        rateLimit: { window: 60, max: 3 },
        sendMagicLink: async ({ email, url }, ctx) =>
          send({ email, url, request: ctx?.request }),
      }),
      // Verifies the Google ID token against socialProviders.google.clientId.
      oneTap(),
      lastLoginMethod({
        cookieName: LAST_LOGIN_METHOD_COOKIE,
        customResolveMethod: resolveOneTapLoginMethod,
      }),
    ],
  });
}

/** Keeps the error name, code and stack frames; drops the message. */
function withoutMessage(error: unknown): Error {
  const source = error instanceof Error ? error : new Error("Non-Error thrown");
  const code =
    (source as { code?: unknown }).code ??
    (source.cause as { code?: unknown } | undefined)?.code;
  const safe = Object.assign(new Error(source.name), {
    ...(code === undefined ? {} : { code }),
  });
  safe.name = source.name;
  const frames = (source.stack ?? "")
    .split("\n")
    .filter((line) => line.trimStart().startsWith("at "));
  safe.stack = [source.name, ...frames].join("\n");
  return safe;
}
