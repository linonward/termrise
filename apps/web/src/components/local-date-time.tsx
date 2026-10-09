"use client";
import { useLocale } from "next-intl";
import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

// Formatted in the browser so users see their own time zone, not the server's.
// The server does not know that time zone, so it renders an empty <time> and
// the text appears after hydration.
export function LocalDateTime({ iso }: { iso: string }) {
  const locale = useLocale();
  const inBrowser = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  if (!inBrowser) return <time dateTime={iso} />;
  const date = new Date(iso);
  const day = new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(
    date,
  );
  const time = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
  return (
    <time dateTime={iso}>
      {day} · {time}
    </time>
  );
}
