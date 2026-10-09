"use client";
import { CircleAlert, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { Button } from "@repo/ui/components/button";

import { findUser } from "@/app/admin/actions";

export function UserSearch() {
  const t = useTranslations("admin");
  const [state, action, pending] = useActionState(findUser, {
    notFound: false,
  });
  return (
    <form action={action} className="space-y-4 md:w-120">
      {state.notFound && (
        <p
          role="alert"
          className="flex gap-3 rounded-md bg-destructive-soft p-4 text-sm font-semibold"
        >
          <CircleAlert
            aria-hidden="true"
            className="size-4.5 shrink-0 text-destructive"
          />
          {t("noUser")}
        </p>
      )}
      <label className="block space-y-2 text-[13px] font-medium">
        <span>{t("query")}</span>
        <input
          name="query"
          required
          autoComplete="off"
          disabled={pending}
          className="h-12 w-full rounded-md border border-border-strong bg-background px-4 text-[15px] focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
        />
      </label>
      <Button type="submit" className="h-12 px-6" disabled={pending}>
        <Search aria-hidden="true" />
        {pending ? t("searching") : t("search")}
      </Button>
    </form>
  );
}
