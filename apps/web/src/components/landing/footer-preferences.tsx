"use client";
import { SunMoon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSyncExternalStore } from "react";

import { analyticsEnabled } from "@repo/analytics/client";
import { Button } from "@repo/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";

import { openCookieSettings } from "@/components/analytics/cookie-banner";
import { ThemeItems } from "@/components/nav/app-nav";

const noSubscription = () => () => {};

// Signed-out pages switch the theme in the footer.
export function FooterPreferences() {
  const t = useTranslations("nav");
  const cookies = useTranslations("cookies");
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
