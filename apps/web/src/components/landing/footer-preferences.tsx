"use client";
import { Globe, SunMoon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useSyncExternalStore } from "react";

import { analyticsEnabled } from "@repo/analytics/client";
import { Button } from "@repo/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";

import { openCookieSettings } from "@/components/analytics/cookie-banner";
import { LocaleItems, ThemeItems } from "@/components/nav/app-nav";

const noSubscription = () => () => {};

// Signed-out pages switch language and theme in the footer (docs/product/ux.md#internationalization).
export function FooterPreferences() {
  const t = useTranslations("nav");
  const cookies = useTranslations("cookies");
  const locale = useLocale();
  // Known only in the browser: false on the server and during hydration.
  const analytics = useSyncExternalStore(
    noSubscription,
    analyticsEnabled,
    () => false,
  );
  return (
    <div className="flex items-center gap-1">
      {analytics && (
        <Button
          variant="ghost"
          className="text-[13px] font-normal text-muted-foreground"
          onClick={openCookieSettings}
        >
          {cookies("settings")}
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" aria-label={t("language")}>
            <Globe aria-hidden="true" />
            {t(`localeShort.${locale}`)}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <LocaleItems />
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={t("theme")}>
            <SunMoon aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <ThemeItems />
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
