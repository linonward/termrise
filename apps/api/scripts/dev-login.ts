// Local development only: prints a magic link for the local database, so signing in
// needs no email provider (docs/architecture/environment.md#local-development).
// Run: DATABASE_URL=<local database> pnpm dev:login --email you@example.com
// (the other variables come from apps/api/.dev.vars)
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import { createAuth } from "@repo/auth/create-auth";
import { createOnUserCreated } from "@repo/auth/on-user-created";
import { createCreditService } from "@repo/credits/credit-service";
import { createDb } from "@repo/db/client";

import product from "../../../product.config";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);

/** Refuses anything but a local database: this link skips the email check. */
export function assertLocal(databaseUrl: string) {
  if (!LOCAL_HOSTS.has(new URL(databaseUrl).hostname))
    throw new Error("dev:login only runs against a local database");
}

export async function devLoginLink(
  env: Record<string, string | undefined>,
  email: string,
) {
  const databaseUrl =
    env.DATABASE_URL ??
    env.CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE;
  const { APP_URL, BETTER_AUTH_URL, BETTER_AUTH_SECRET } = env;
  if (!databaseUrl || !APP_URL || !BETTER_AUTH_URL || !BETTER_AUTH_SECRET)
    throw new Error(
      "Set DATABASE_URL, and APP_URL, BETTER_AUTH_URL, BETTER_AUTH_SECRET in apps/api/.dev.vars",
    );
  assertLocal(databaseUrl);
  const database = createDb(databaseUrl);
  let link = "";
  try {
    const auth = createAuth(
      database,
      {
        appName: product.name,
        baseURL: BETTER_AUTH_URL,
        appOrigin: APP_URL,
        secret: BETTER_AUTH_SECRET,
        googleClientId: env.GOOGLE_CLIENT_ID ?? "local",
        googleClientSecret: env.GOOGLE_CLIENT_SECRET ?? "local",
      },
      async ({ url }) => {
        link = url;
      },
      createOnUserCreated({
        credits: createCreditService(database),
        signupBonusCredits: product.signupBonusCredits,
      }),
    );
    await auth.api.signInMagicLink({
      headers: new Headers({ origin: APP_URL }),
      body: { email, callbackURL: `${APP_URL}/dashboard` },
    });
  } finally {
    await database.pool.end();
  }
  return link;
}

async function main() {
  const { values } = parseArgs({ options: { email: { type: "string" } } });
  if (!values.email) throw new Error("Usage: pnpm dev:login --email <email>");
  console.log(await devLoginLink(process.env, values.email));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href)
  main().catch((error: Error) => {
    console.error(`${error.name}: ${error.message}`);
    process.exit(1);
  });
