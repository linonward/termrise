import { cn } from "cn";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { LogoLink } from "@/components/logo-link";

// Design: Desktop / Not found and Desktop / Error — logo-only top bar, centered
// icon, title, body and actions.
export function StatusPage({
  icon: Icon,
  tone,
  code,
  title,
  body,
  children,
}: {
  icon: LucideIcon;
  tone: "neutral" | "destructive";
  code?: string;
  title: string;
  body: string;
  children: ReactNode;
}) {
  return (
    <>
      <header className="mx-auto flex h-16 w-full max-w-360 items-center px-5 md:h-18 md:px-30">
        <LogoLink />
      </header>
      <main className="flex flex-1 flex-col items-center justify-center px-5 pt-10 pb-18">
        <div className="flex w-full max-w-120 flex-col items-center gap-6 text-center">
          <span
            className={cn(
              "flex size-16 items-center justify-center rounded-full",
              tone === "neutral"
                ? "bg-surface-strong text-muted-foreground"
                : "bg-destructive-soft text-destructive",
            )}
          >
            <Icon aria-hidden="true" className="size-7" />
          </span>
          <div className="space-y-2.5">
            {code && (
              <p className="text-xs font-bold tracking-[1.2px] text-subtle-foreground uppercase">
                {code}
              </p>
            )}
            <h1 className="font-heading text-[28px] font-bold tracking-[-0.8px] md:text-4xl">
              {title}
            </h1>
            <p className="text-[15px] text-muted-foreground">{body}</p>
          </div>
          <div className="flex flex-col gap-3 pt-2 sm:flex-row">{children}</div>
        </div>
      </main>
    </>
  );
}
