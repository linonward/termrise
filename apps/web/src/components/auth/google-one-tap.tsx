"use client";
import { useEffect } from "react";

type GoogleIdentity = { accounts: { id: { cancel(): void } } };

// The first scroll, tap, click or key press.
const INTERACTION_EVENTS = [
  "scroll",
  "pointerdown",
  "touchstart",
  "keydown",
] as const;

// Google One Tap prompt for signed-out visitors. Renders nothing itself;
// Google draws the prompt. The client ID is public, not a secret.
export function GoogleOneTap({
  clientId,
  callbackURL,
  deferUntilInteraction = false,
}: {
  clientId: string;
  callbackURL: string;
  // Loads Google's script (about 100 KiB) only after the first interaction,
  // so it does not compete with the first paint of the landing page.
  deferUntilInteraction?: boolean;
}) {
  useEffect(() => {
    let unmounted = false;
    const show = async () => {
      stopListening();
      // The auth client loads here, not with the page: on the landing page it waits
      // for the first interaction like Google's script.
      const [{ oneTapClient }, { createAuthClient }] = await Promise.all([
        import("better-auth/client/plugins"),
        import("better-auth/react"),
      ]);
      if (unmounted) return;
      const client = createAuthClient({
        // Better Auth runs on apps/api (docs/architecture/security.md#auth-on-the-api).
        baseURL: process.env.NEXT_PUBLIC_API_URL,
        // Show the prompt once per page; a dismissed prompt does not come back.
        plugins: [
          oneTapClient({ clientId, promptOptions: { maxAttempts: 0 } }),
        ],
      });
      // The prompt is optional: a blocked script or a dismissal keeps the page as is.
      await client
        .oneTap({ callbackURL: new URL(callbackURL, location.origin).href })
        .catch(() => {});
    };
    // One listener reference, so stopListening removes exactly what was added.
    const onInteraction = () => void show();
    const stopListening = () =>
      INTERACTION_EVENTS.forEach((event) =>
        window.removeEventListener(event, onInteraction),
      );
    if (deferUntilInteraction)
      INTERACTION_EVENTS.forEach((event) =>
        window.addEventListener(event, onInteraction, {
          once: true,
          passive: true,
        }),
      );
    else void show();
    return () => {
      unmounted = true;
      stopListening();
      (window as { google?: GoogleIdentity }).google?.accounts.id.cancel();
    };
  }, [clientId, callbackURL, deferUntilInteraction]);
  return null;
}
