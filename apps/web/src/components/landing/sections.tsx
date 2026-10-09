// Building blocks for marketing pages (Landing, Pricing).
import {
  ArrowRight,
  Coins,
  Play,
  Plus,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { Button } from "@repo/ui/components/button";

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold tracking-[1px] text-brand-text uppercase">
      {children}
    </p>
  );
}

export function SectionTitle({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) {
  return (
    <h2
      id={id}
      className="font-heading text-[28px] font-bold tracking-tight md:text-4xl"
    >
      {children}
    </h2>
  );
}

export function CreateButton({
  label,
  href = "/sign-up",
}: {
  label: string;
  href?: string;
}) {
  return (
    <Button asChild size="lg" className="h-12 px-6 text-[15px]">
      <Link href={href}>
        <ArrowRight aria-hidden="true" />
        {label}
      </Link>
    </Button>
  );
}

const steps = [
  { key: "signup", icon: UserPlus },
  { key: "run", icon: Play },
  { key: "buy", icon: Coins },
] as const;

export async function HowItWorks() {
  const t = await getTranslations("landing.steps");
  return (
    <section
      id="how-it-works"
      aria-labelledby="steps-title"
      className="mx-auto w-full max-w-310 scroll-mt-16 space-y-8 px-5 py-16"
    >
      <div className="space-y-3">
        <Eyebrow>{t("eyebrow")}</Eyebrow>
        <SectionTitle id="steps-title">{t("title")}</SectionTitle>
      </div>
      <ol className="grid gap-8 md:grid-cols-3">
        {steps.map(({ key, icon: Icon }, index) => (
          <li key={key} className="space-y-2 border-t border-border pt-6">
            <p className="flex items-center gap-2 text-[13px] font-semibold text-brand-text tabular-nums">
              {String(index + 1).padStart(2, "0")}
              <Icon className="size-4 text-foreground" aria-hidden="true" />
            </p>
            <h3 className="text-lg font-semibold">{t(`${key}.title`)}</h3>
            <p className="text-[15px] text-muted-foreground">
              {t(`${key}.body`)}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}

// Title on the left, a divided list with icon chips on the right.
export function IconListSection({
  id,
  eyebrow,
  title,
  items,
}: {
  id: string;
  eyebrow: string;
  title: string;
  items: {
    key: string;
    icon: LucideIcon;
    title: string;
    body: string;
    formats?: string;
  }[];
}) {
  return (
    <section aria-labelledby={id} className="border-t border-border">
      <div className="mx-auto grid w-full max-w-310 gap-8 px-5 py-16 md:grid-cols-[1fr_2fr] md:gap-12">
        <div className="space-y-3">
          <Eyebrow>{eyebrow}</Eyebrow>
          <SectionTitle id={id}>{title}</SectionTitle>
        </div>
        <ul className="divide-y divide-border">
          {items.map(({ key, icon: Icon, title, body, formats }) => (
            <li key={key} className="flex gap-4 py-6 first:pt-0">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-sm bg-brand-soft">
                <Icon className="size-4 text-brand-text" aria-hidden="true" />
              </span>
              <div className="flex-1 space-y-1">
                <h3 className="text-[15px] font-semibold">{title}</h3>
                <p className="text-[13px] text-muted-foreground">{body}</p>
              </div>
              {formats && (
                <span className="text-xs text-subtle-foreground tabular-nums">
                  {formats}
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function FaqItem({
  question,
  children,
}: {
  question: string;
  children: React.ReactNode;
}) {
  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-[15px] font-semibold [&::-webkit-details-marker]:hidden">
        {question}
        <Plus
          className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-45"
          aria-hidden="true"
        />
      </summary>
      <p className="pb-4 text-[15px] text-muted-foreground">{children}</p>
    </details>
  );
}

export function FaqSection({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id="faq"
      aria-labelledby="faq-title"
      className="scroll-mt-16 border-t border-border"
    >
      <div className="mx-auto grid w-full max-w-310 gap-8 px-5 py-16 md:grid-cols-[1fr_2fr] md:gap-12">
        <div className="space-y-3">
          <Eyebrow>{eyebrow}</Eyebrow>
          <SectionTitle id="faq-title">{title}</SectionTitle>
        </div>
        <div className="divide-y divide-border border-y border-border">
          {children}
        </div>
      </div>
    </section>
  );
}

export function FinalCta({
  title,
  body,
  cta,
  href,
  note,
}: {
  title: string;
  body: string;
  cta: string;
  href?: string;
  // Small print under the box, such as a trademark notice.
  note?: string;
}) {
  return (
    <section aria-labelledby="cta-title" className="px-5 pb-16">
      <div className="mx-auto flex w-full max-w-300 flex-col items-center gap-4 rounded-lg bg-surface px-6 py-16 text-center">
        <SectionTitle id="cta-title">{title}</SectionTitle>
        <p className="text-[15px] text-muted-foreground">{body}</p>
        <div className="pt-2">
          <CreateButton label={cta} href={href} />
        </div>
      </div>
      {note && (
        <p className="mx-auto mt-6 max-w-300 text-center text-xs text-subtle-foreground">
          {note}
        </p>
      )}
    </section>
  );
}
