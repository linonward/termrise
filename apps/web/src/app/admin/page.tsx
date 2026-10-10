import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { UserSearch } from "@/components/admin/user-search";
import { isAdmin } from "@/server/api/api";

export default async function AdminPage() {
  if (!(await isAdmin())) notFound();
  const t = await getTranslations("admin");
  return (
    <main className="mx-auto w-full max-w-310 space-y-8 px-5 py-8 md:py-16">
      <div className="space-y-2">
        <h1 className="font-heading text-[28px] font-bold tracking-tight md:text-4xl">
          {t("searchTitle")}
        </h1>
        <p className="text-[15px] text-muted-foreground">
          {t("searchDescription")}
        </p>
      </div>
      <UserSearch />
    </main>
  );
}
