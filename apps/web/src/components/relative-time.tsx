"use client";
import { useLocale } from "next-intl";
import { useState } from "react";

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
];

function relative(iso: string, now: number, locale: string) {
  const seconds = (new Date(iso).getTime() - now) / 1000;
  const [unit, size] = UNITS.find(([, s]) => Math.abs(seconds) >= s) ?? [
    "second",
    1,
  ];
  return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(
    unit === "second" ? 0 : Math.round(seconds / size),
    unit,
  );
}

// "now", "2 hours ago", "yesterday". A difference of two instants does not
// depend on the time zone, so the server renders the final text and nothing
// swaps after hydration. If the minute rolls over between the server render
// and hydration, the server text stays (suppressHydrationWarning).
export function RelativeTime({ iso }: { iso: string }) {
  const locale = useLocale();
  const [now] = useState(() => Date.now());
  return (
    <time dateTime={iso} suppressHydrationWarning>
      {relative(iso, now, locale)}
    </time>
  );
}
