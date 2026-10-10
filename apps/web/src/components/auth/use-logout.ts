"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { withPostHog } from "@repo/analytics/client";

export function useLogout() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  async function logout() {
    setPending(true);
    setError(false);
    try {
      // Loaded on click: the dashboard only needs the auth client to sign out.
      const { authClient } = await import("@/lib/auth-client");
      const result = await authClient.signOut();
      if (result.error) throw new Error();
      withPostHog((posthog) => posthog.reset());
      router.replace("/sign-in");
      router.refresh();
    } catch {
      setError(true);
      setPending(false);
    }
  }
  return { pending, error, logout };
}
