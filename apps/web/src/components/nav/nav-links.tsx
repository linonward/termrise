"use client";
import { cn } from "cn";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

const links = [
  { href: "/dashboard", key: "dashboard" },
  { href: "/billing", key: "billing" },
] as const;

function isActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
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
      {links.map(({ href, key }) => {
        const active = isActive(pathname, href);
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
