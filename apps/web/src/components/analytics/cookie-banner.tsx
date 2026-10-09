"use client";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import {
  analyticsConsent,
  analyticsEnabled,
  chooseConsent,
  resetConsent,
  withPostHog,
} from "@repo/analytics/client";
import { Button } from "@repo/ui/components/button";

const OPEN_EVENT = "cookie-settings:open";

/** Reopens the banner so the visitor can change their choice. */
export function openCookieSettings() {
  resetConsent();
  window.dispatchEvent(new Event(OPEN_EVENT));
}

// Analytics cookies only after consent (docs/architecture/observability.md#analytics).
export function CookieBanner() {
  const t = useTranslations("cookies");
  const locale = useLocale();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!analyticsEnabled()) return;
    withPostHog((posthog) => posthog.register({ locale }));
  }, [locale]);

  useEffect(() => {
    if (!analyticsEnabled()) return;
    const show = () => setOpen(true);
    // The choice is read from the cookie: the SDK is not loaded before consent.
    if (analyticsConsent() === undefined) show();
    window.addEventListener(OPEN_EVENT, show);
    return () => window.removeEventListener(OPEN_EVENT, show);
  }, []);

  if (!open) return null;
  const choose = (granted: boolean) => {
    chooseConsent(granted);
    withPostHog((posthog) => posthog.register({ locale }));
    setOpen(false);
  };
  return (
    <section
      aria-label={t("title")}
      className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-xl flex-col gap-4 rounded-lg border border-border bg-background p-6 sm:flex-row sm:items-center"
    >
      <p className="flex-1 text-[13px] text-muted-foreground">
        {t.rich("body", {
          link: (chunks) => (
            <Link
              href="/privacy"
              className="font-medium text-foreground underline underline-offset-4"
            >
              {chunks}
            </Link>
          ),
        })}
      </p>
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => choose(false)}>
          {t("decline")}
        </Button>
        <Button onClick={() => choose(true)}>{t("accept")}</Button>
      </div>
    </section>
  );
}
