"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

const INTERVAL_MS = 2000;

// The worker runs research in the background: reload the page data until the run ends.
export function RunPoller() {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), INTERVAL_MS);
    return () => clearInterval(timer);
  }, [router]);
  return null;
}
