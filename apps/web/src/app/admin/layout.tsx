import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { LogoLink } from "@/components/logo-link";
import { isAdmin } from "@/server/api/api";

export const metadata: Metadata = { robots: { index: false, follow: false } };

// Not an admin, or signed out: 404, so /admin does not reveal that it exists.
// Pages and actions check again; this layout alone does not protect them.
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  if (!(await isAdmin())) notFound();
  const t = await getTranslations("admin");
  return (
    <>
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 w-full max-w-310 items-center gap-3 px-5">
          <LogoLink />
          <span className="inline-flex h-6 items-center rounded-full bg-surface-strong px-2 text-xs font-semibold tracking-[1px] text-muted-foreground uppercase">
            {t("label")}
          </span>
        </div>
      </header>
      {children}
    </>
  );
}
