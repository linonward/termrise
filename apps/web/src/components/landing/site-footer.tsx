import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { LogoMark } from "@/components/logo-mark";
import product from "@product";

import { FooterPreferences } from "./footer-preferences";

const legalLinks = [
  { href: "/terms", key: "terms" },
  { href: "/privacy", key: "privacy" },
  ...(product.billingEnabled
    ? [{ href: "/refund-policy", key: "refund" } as const]
    : []),
] as const;

export async function SiteFooter() {
  const t = await getTranslations();
  return (
    <footer className="border-t border-border">
      <div className="mx-auto w-full max-w-310 space-y-4 px-5 py-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-center">
          <div className="flex flex-wrap items-center gap-4">
            <span className="flex items-center gap-2">
              <LogoMark className="size-5" />
              <span className="font-heading text-[15px] font-bold tracking-tight">
                {t("meta.title")}
              </span>
            </span>
            <p className="text-[13px] text-muted-foreground">
              {t("landing.footer.copyright", {
                year: new Date().getFullYear(),
              })}
            </p>
            <a
              href={`mailto:${product.supportEmail}`}
              className="text-[13px] text-muted-foreground transition-colors hover:text-foreground"
            >
              {t("landing.footer.support", { email: product.supportEmail })}
            </a>
          </div>
          <div className="flex flex-wrap items-center gap-6 md:ml-auto">
            <Link
              href="/blog"
              className="text-[13px] text-muted-foreground transition-colors hover:text-foreground"
            >
              {t("landing.footer.blog")}
            </Link>
            <nav aria-label={t("landing.footer.legal")}>
              <ul className="flex flex-wrap gap-6">
                {legalLinks.map(({ href, key }) => (
                  <li key={href}>
                    <Link
                      href={href}
                      className="text-[13px] text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {t(`landing.footer.${key}`)}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
            <FooterPreferences />
          </div>
        </div>
      </div>
    </footer>
  );
}
