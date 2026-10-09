import { Coins } from "lucide-react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { safeNext } from "@repo/auth/auth-redirect";
import { LAST_LOGIN_METHOD_COOKIE } from "@repo/auth/last-login-method";
import { serverEnv } from "@repo/config/env";

import { LogoLink } from "@/components/logo-link";
import { getSession } from "@/server/auth/auth";

import { AuthForm } from "./auth-form";
import { GoogleOneTap } from "./google-one-tap";

// Form on the left, product panel on the right;
// mobile keeps the form and moves the free credits note below it.
export async function AuthPage({
  mode,
  searchParams,
}: {
  mode: "login" | "signup";
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = safeNext(params.next);
  const requestHeaders = await headers();
  if (await getSession(requestHeaders)) redirect(next);
  const lastMethod = (await cookies()).get(LAST_LOGIN_METHOD_COOKIE)?.value;
  const t = await getTranslations("landing");
  return (
    <div className="flex flex-1">
      <GoogleOneTap
        clientId={serverEnv().GOOGLE_CLIENT_ID}
        callbackURL={next}
      />
      <div className="flex flex-1 flex-col">
        <header className="flex h-14 items-center px-5 lg:h-18 lg:px-20">
          <LogoLink />
        </header>
        <main className="flex flex-1 flex-col gap-6 px-5 pt-10 pb-8 lg:items-center lg:justify-center lg:px-0 lg:pt-0 lg:pb-18">
          <AuthForm
            mode={mode}
            next={next}
            invalidLink={Boolean(params.error)}
            googleLastUsed={lastMethod === "google"}
          />
          <p className="flex items-center gap-2 rounded-md bg-surface px-3.5 py-3 text-[13px] text-muted-foreground lg:hidden">
            <Coins aria-hidden="true" className="size-4 shrink-0 text-brand" />
            {t("hero.note")}
          </p>
        </main>
      </div>
      <aside className="hidden p-4 lg:flex lg:w-1/2 xl:w-160">
        <div className="flex flex-1 flex-col items-center justify-center gap-6 rounded-lg bg-surface">
          <p className="max-w-85 text-center font-heading text-2xl font-bold tracking-tight">
            {t.rich("hero.title", {
              line: (chunks) => <span className="block">{chunks}</span>,
            })}
          </p>
          <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <Coins aria-hidden="true" className="size-4 text-brand" />
            {t("hero.note")}
          </p>
        </div>
      </aside>
    </div>
  );
}
