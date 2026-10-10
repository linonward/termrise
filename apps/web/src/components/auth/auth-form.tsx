"use client";
import { ArrowLeft, CircleAlert, Globe, Mail } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { track } from "@repo/analytics/client";
import { Button } from "@repo/ui/components/button";

import { authClient, siteUrl } from "@/lib/auth-client";

export function AuthForm({
  mode,
  next,
  invalidLink,
  googleLastUsed,
}: {
  mode: "login" | "signup";
  next: string;
  invalidLink: boolean;
  googleLastUsed: boolean;
}) {
  const t = useTranslations("auth");
  const locale = useLocale();
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(invalidLink ? t("invalidLink") : "");
  async function signIn(email?: string) {
    setPending(true);
    setError("");
    if (mode === "signup")
      track("signup_started", { method: email ? "email" : "google" });
    try {
      const result = email
        ? await authClient.signIn.magicLink({
            email,
            callbackURL: siteUrl(next),
            newUserCallbackURL: siteUrl(next),
            errorCallbackURL: siteUrl(
              `/sign-in?next=${encodeURIComponent(next)}&error=invalid_link`,
            ),
            // apps/api writes the email in this language; the NEXT_LOCALE
            // cookie of this site does not reach the API's subdomain.
            fetchOptions: { headers: { "Accept-Language": locale } },
          })
        : await authClient.signIn.social({
            provider: "google",
            callbackURL: siteUrl(next),
            errorCallbackURL: siteUrl("/sign-in?error=oauth"),
          });
      if (result.error)
        setError(
          result.error.code === "MAGIC_LINK_DAILY_LIMIT"
            ? t("emailUnavailable")
            : result.error.status === 429
              ? t("rateLimited")
              : t("error"),
        );
      else if (email) setSent(true);
    } catch {
      setError(t("error"));
    } finally {
      setPending(false);
    }
  }
  return (
    <section
      className="flex w-full flex-col gap-7 lg:w-100 lg:gap-8"
      aria-labelledby="auth-title"
    >
      <div className="space-y-3">
        <h1
          id="auth-title"
          className="font-heading text-[28px] font-bold tracking-[-0.8px] md:text-4xl"
        >
          {sent
            ? t("checkEmail")
            : mode === "login"
              ? t("loginTitle")
              : t("signupTitle")}
        </h1>
        <p className="text-[15px] text-muted-foreground">
          {sent ? t("sent") : t("description")}
        </p>
      </div>
      {error && (
        <p
          role="alert"
          className="flex gap-3 rounded-md bg-destructive-soft p-4 text-sm font-semibold"
        >
          <CircleAlert
            aria-hidden="true"
            className="size-4.5 shrink-0 text-destructive"
          />
          {error}
        </p>
      )}
      {sent ? (
        <Button
          variant="outline"
          className="h-12 w-full px-4"
          onClick={() => setSent(false)}
        >
          <ArrowLeft aria-hidden="true" />
          {t("tryAgain")}
        </Button>
      ) : (
        <>
          <div className="space-y-5">
            <Button
              variant="outline"
              className="relative h-12 w-full px-4"
              disabled={pending}
              onClick={() => void signIn()}
            >
              <Globe aria-hidden="true" />
              {t("google")}
              {/* Sits on the top border so it never covers the label. */}
              {googleLastUsed && (
                <>
                  <span className="sr-only">({t("lastUsed")})</span>
                  <span
                    aria-hidden="true"
                    className="absolute -top-2.5 right-4 rounded-full bg-brand-soft px-2.5 py-0.5 text-xs font-semibold text-brand-text ring-2 ring-background"
                  >
                    {t("lastUsed")}
                  </span>
                </>
              )}
            </Button>
            <div className="flex items-center gap-3 text-[13px] text-muted-foreground">
              <span aria-hidden="true" className="h-px flex-1 bg-border" />
              {t("divider")}
              <span aria-hidden="true" className="h-px flex-1 bg-border" />
            </div>
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                void signIn(
                  String(new FormData(event.currentTarget).get("email")),
                );
              }}
            >
              <label className="block space-y-2 text-[13px] font-medium">
                <span>{t("email")}</span>
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  disabled={pending}
                  className="h-12 w-full rounded-md border border-border-strong bg-background px-4 text-[15px] focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
                />
              </label>
              <Button
                type="submit"
                className="h-12 w-full px-4"
                disabled={pending}
              >
                <Mail aria-hidden="true" />
                {pending ? t("sending") : t("sendLink")}
              </Button>
            </form>
          </div>
          <Link
            className="text-center text-[13px] text-muted-foreground hover:text-foreground hover:underline"
            href={`/${mode === "login" ? "sign-up" : "sign-in"}?next=${encodeURIComponent(next)}`}
          >
            {mode === "login" ? t("signupSwitch") : t("loginSwitch")}
          </Link>
        </>
      )}
    </section>
  );
}
