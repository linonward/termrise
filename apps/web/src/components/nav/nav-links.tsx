"use client";
import { cn } from "cn";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

import product from "@product";

// The workbench's sections (S91, docs/product/ux.md#navigation): each link is active on
// every page of its section. No Billing link while the product does not charge.
const links = [
  { href: "/today", key: "today", match: ["/today"] },
  { href: "/discover", key: "find", match: ["/discover", "/keywords"] },
  { href: "/products", key: "build", match: ["/products", "/opportunities"] },
  { href: "/sites", key: "fleet", match: ["/sites", "/settings/expenses"] },
  ...(product.billingEnabled
    ? [{ href: "/billing", key: "billing", match: ["/billing"] } as const]
    : []),
] as const;

function isActive(pathname: string, match: readonly string[]) {
  return match.some((m) => pathname === m || pathname.startsWith(`${m}/`));
}

export function NavLinks({
  layout,
  onNavigate,
}: {
  layout: "bar" | "drawer";
  onNavigate?: () => void;
}) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  return (
    <ul
      className={cn(
        "flex",
        layout === "bar" ? "h-full items-stretch gap-8" : "flex-col gap-1",
      )}
    >
      {links.map(({ href, key, match }) => {
        const active = isActive(pathname, match);
        return (
          <li key={href} className="flex">
            <Link
              href={href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center text-[15px] transition-colors hover:text-foreground",
                layout === "bar"
                  ? "border-b-2 pt-0.5"
                  : "h-12 w-full border-l-2 px-4",
                active
                  ? "border-foreground font-semibold text-foreground"
                  : "border-transparent text-muted-foreground",
              )}
            >
              {t(key)}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
