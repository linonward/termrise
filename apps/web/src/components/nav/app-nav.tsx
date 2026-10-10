"use client";
import { cn } from "cn";
import { Coins, Menu } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { useState, useTransition } from "react";

import { locales } from "@repo/config/locale";
import { Button } from "@repo/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@repo/ui/components/sheet";

import { useLogout } from "@/components/auth/use-logout";
import { LogoMark } from "@/components/logo-mark";
import { setLocale } from "@/i18n/actions";

import { NavLinks } from "./nav-links";

const themes = ["system", "light", "dark"] as const;

function useLocaleSwitch() {
  const [pending, startTransition] = useTransition();
  return {
    pending,
    switchTo: (locale: string) => startTransition(() => setLocale(locale)),
  };
}

export function LocaleItems() {
  const t = useTranslations("nav");
  const { pending, switchTo } = useLocaleSwitch();
  return (
    <DropdownMenuRadioGroup value={useLocale()} onValueChange={switchTo}>
      {locales.map((locale) => (
        <DropdownMenuRadioItem key={locale} value={locale} disabled={pending}>
          {t(`localeName.${locale}`)}
        </DropdownMenuRadioItem>
      ))}
    </DropdownMenuRadioGroup>
  );
}

export function ThemeItems() {
  const t = useTranslations("nav");
  const { theme, setTheme } = useTheme();
  return (
    <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
      {themes.map((value) => (
        <DropdownMenuRadioItem key={value} value={value}>
          {t(value)}
        </DropdownMenuRadioItem>
      ))}
    </DropdownMenuRadioGroup>
  );
}

function CreditsPill({
  balance,
  className,
}: {
  balance: number;
  className?: string;
}) {
  const t = useTranslations("nav");
  return (
    <Link
      href="/billing"
      data-testid="nav-credits"
      className={cn(
        "flex h-8 items-center gap-2 rounded-full border border-border bg-surface px-3 text-[13px] font-medium tabular-nums",
        className,
      )}
    >
      <Coins className="size-4 text-brand" aria-hidden="true" />
      {t("credits", { count: balance })}
    </Link>
  );
}

// Same button group as the dropdown radio items, for the mobile drawer.
function ChoiceGroup<T extends string>({
  label,
  options,
  value,
  onChange,
  disabled,
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: string | undefined;
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <div role="group" aria-label={label} className="space-y-2">
      <p className="text-[13px] font-medium text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <Button
            key={option.value}
            variant={option.value === value ? "default" : "outline"}
            aria-pressed={option.value === value}
            disabled={disabled}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

function MobileMenu({
  email,
  logout,
}: {
  email: string;
  logout: ReturnType<typeof useLogout>;
}) {
  const t = useTranslations("nav");
  const [open, setOpen] = useState(false);
  const locale = useLocale();
  const { pending, switchTo } = useLocaleSwitch();
  const { theme, setTheme } = useTheme();
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t("openMenu")}>
          <Menu className="size-5" aria-hidden="true" />
        </Button>
      </SheetTrigger>
      <SheetContent closeLabel={t("closeMenu")} className="gap-6 pb-6">
        <SheetHeader>
          <SheetTitle>{t("menu")}</SheetTitle>
        </SheetHeader>
        <nav aria-label={t("primary")}>
          <NavLinks layout="drawer" onNavigate={() => setOpen(false)} />
        </nav>
        <div className="space-y-6 border-t border-border px-4 pt-6">
          <p className="truncate text-[13px] text-muted-foreground">{email}</p>
          <ChoiceGroup
            label={t("language")}
            value={locale}
            disabled={pending}
            onChange={switchTo}
            options={locales.map((value) => ({
              value,
              label: t(`localeName.${value}`),
            }))}
          />
          <ChoiceGroup
            label={t("theme")}
            value={theme}
            onChange={setTheme}
            options={themes.map((value) => ({ value, label: t(value) }))}
          />
          <Button
            variant="outline"
            className="w-full"
            disabled={logout.pending}
            onClick={() => void logout.logout()}
          >
            {logout.pending ? t("loggingOut") : t("logout")}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function AppNav({ email, balance }: { email: string; balance: number }) {
  const t = useTranslations("nav");
  const brand = useTranslations("meta")("title");
  const logout = useLogout();
  return (
    <header className="border-b border-border bg-background">
      <div className="flex h-14 items-center gap-8 px-5 md:h-16 md:px-8">
        <Link href="/dashboard" className="flex items-center gap-2">
          <LogoMark className="size-6 md:size-5.5" />
          <span className="font-heading text-xl font-bold tracking-tight max-md:sr-only">
            {brand}
          </span>
        </Link>
        <nav aria-label={t("primary")} className="hidden h-full md:block">
          <NavLinks layout="bar" />
        </nav>
        <div className="ml-auto flex items-center gap-1 md:gap-3">
          <CreditsPill balance={balance} className="mr-2 md:mr-0" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t("userMenu")}
                className="rounded-full bg-surface-strong text-[13px] font-semibold uppercase max-md:hidden"
              >
                {email.charAt(0)}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="truncate font-normal text-muted-foreground">
                {email}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>{t("language")}</DropdownMenuLabel>
              <LocaleItems />
              <DropdownMenuSeparator />
              <DropdownMenuLabel>{t("theme")}</DropdownMenuLabel>
              <ThemeItems />
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={logout.pending}
                onSelect={() => void logout.logout()}
              >
                {logout.pending ? t("loggingOut") : t("logout")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="md:hidden">
            <MobileMenu email={email} logout={logout} />
          </div>
        </div>
      </div>
      {logout.error && (
        <p
          role="alert"
          className="px-5 pb-3 text-[13px] text-destructive md:px-8"
        >
          {t("logoutError")}
        </p>
      )}
    </header>
  );
}
