import { cn } from "cn";
import type { LucideIcon } from "lucide-react";
import * as React from "react";

// Badge/* and Tag/* of the design file (Components / Product).
export type BadgeTone = "neutral" | "info" | "success" | "warning" | "danger";

const tones: Record<BadgeTone, string> = {
  neutral: "bg-surface-strong text-muted-foreground",
  info: "bg-info-soft text-info",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-destructive-soft text-destructive",
};

/** A status: 24 high, pill, 14px icon, 12 / 600 uppercase. */
function Badge({
  tone,
  icon: Icon,
  spin = false,
  className,
  children,
  ...props
}: React.ComponentProps<"span"> & {
  tone: BadgeTone;
  icon: LucideIcon;
  /** For work in progress (loader-circle). */
  spin?: boolean;
}) {
  return (
    <span
      data-slot="badge"
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-xs font-semibold tracking-[1px] whitespace-nowrap uppercase",
        tones[tone],
        className,
      )}
      {...props}
    >
      <Icon
        aria-hidden="true"
        className={cn("size-3.5 shrink-0", spin && "motion-safe:animate-spin")}
      />
      {children}
    </span>
  );
}

/** Not a status (a source, Seed): 20 high, pill, 12 / 600, no icon. */
function Tag({
  tone = "neutral",
  className,
  ...props
}: React.ComponentProps<"span"> & { tone?: "neutral" | "brand" }) {
  return (
    <span
      data-slot="tag"
      className={cn(
        "inline-flex h-5 shrink-0 items-center rounded-full px-2 text-xs font-semibold whitespace-nowrap",
        tone === "brand"
          ? "bg-brand-soft text-brand-text"
          : "bg-surface-strong text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

export { Badge, Tag };
