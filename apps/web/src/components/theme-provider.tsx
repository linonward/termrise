"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

// System / Light / Dark, class strategy; see docs/design/design-system.md#theming
// nonce: the inline theme script must pass the CSP (proxy.ts).
export function ThemeProvider({
  children,
  nonce,
}: {
  children: React.ReactNode;
  nonce?: string;
}) {
  return (
    <NextThemesProvider
      nonce={nonce}
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
