import type { LucideIcon } from "lucide-react";
import Link from "next/link";

import { Button } from "@repo/ui/components/button";

/**
 * Empty State (docs/design/design-system.md#product-components): thin rules above and
 * below, no fill. A list page gives an icon, a title and the next step; a section only
 * gives the body.
 */
export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon?: LucideIcon;
  title?: string;
  body: React.ReactNode;
  action?: { href: string; label: string };
}) {
  return (
    <div className="space-y-3 border-y border-border-strong py-8">
      {Icon && <Icon aria-hidden="true" className="size-5 text-brand" />}
      {title && <h3 className="font-heading text-lg font-semibold">{title}</h3>}
      <p className="max-w-150 text-[15px] text-muted-foreground">{body}</p>
      {action && (
        <Button asChild variant="outline" className="h-10 px-4">
          <Link href={action.href}>{action.label}</Link>
        </Button>
      )}
    </div>
  );
}
