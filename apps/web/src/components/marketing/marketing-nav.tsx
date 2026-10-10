import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { Button } from "@repo/ui/components/button";

import { LogoMark } from "@/components/logo-mark";
import product from "@product";

const ALL_LINKS = [
  ["pricing", "/pricing"],
  ["blog", "/blog"],
] as const;
// No pricing link while the product does not charge (product.config.ts billingEnabled).
const LINKS = ALL_LINKS.filter(
  ([key]) => product.billingEnabled || key !== "pricing",
);

// Public pages header. Signed-in visitors get a Dashboard link.
export async function MarketingNav({
  current,
  signedIn,
}: {
  current?: (typeof ALL_LINKS)[number][0];
  signedIn: boolean;
}) {
  const t = await getTranslations("marketing");
  const brand = (await getTranslations("meta"))("title");
  return (
    <header className="bg-background">
      <div className="mx-auto flex h-16 max-w-360 items-center gap-8 px-5 md:h-18 md:px-30">
        <Link href="/" className="flex items-center gap-2">
          <LogoMark className="size-5.5" />
          <span className="font-heading text-xl font-bold tracking-tight">
            {brand}
          </span>
        </Link>
        <nav aria-label={t("nav")} className="mx-auto hidden md:block">
          <ul className="flex gap-8 text-sm">
            {LINKS.map(([key, href]) => (
              <li key={key}>
                <Link
                  href={href}
                  aria-current={current === key ? "page" : undefined}
                  className="font-medium text-muted-foreground hover:text-foreground aria-[current=page]:font-semibold aria-[current=page]:text-foreground"
                >
                  {t(key)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="ml-auto flex items-center gap-5 md:ml-0">
          {signedIn ? (
            <Button asChild className="h-9 px-4 text-sm font-semibold">
              <Link href="/dashboard">{t("dashboard")}</Link>
            </Button>
          ) : (
            <>
              <Link href="/sign-in" className="text-sm font-semibold">
                {t("login")}
              </Link>
              <Button
                asChild
                className="hidden h-9 px-4 text-sm font-semibold md:inline-flex"
              >
                <Link href="/sign-up">{t("cta")}</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
