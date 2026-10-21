import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Source_Serif_4 } from "next/font/google";
import { headers } from "next/headers";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";

import { serverEnv } from "@repo/config/env";

import { CookieBanner } from "@/components/analytics/cookie-banner";
import { SpeedInsights } from "@/components/analytics/speed-insights";
import { WebAnalytics } from "@/components/analytics/web-analytics";
import { ThemeProvider } from "@/components/theme-provider";
import { pickClientMessages } from "@/i18n/client-messages";
import { NONCE_HEADER } from "@/server/http/csp";

import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

// opsz: the browser picks the optical size from the font size (theme.css --font-heading).
const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
  axes: ["opsz"],
});

// Numbers in tables (theme.css --font-mono).
const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  const brand = t("title");
  const title = t("homeTitle");
  const description = t("description");
  return {
    metadataBase: new URL(serverEnv().APP_URL),
    title: { default: title, template: `%s · ${brand}` },
    description,
    openGraph: {
      type: "website",
      siteName: brand,
      title,
      description,
      locale: "zh_CN",
    },
    twitter: { card: "summary_large_image" },
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const messages = pickClientMessages(await getMessages());
  const nonce = (await headers()).get(NONCE_HEADER) ?? undefined;
  return (
    <html
      lang="zh-CN"
      suppressHydrationWarning
      className={`${inter.variable} ${sourceSerif.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <NextIntlClientProvider messages={messages}>
          <ThemeProvider nonce={nonce}>
            {children}
            <CookieBanner />
            {/* Only Vercel deployments serve the Web Analytics and Speed Insights scripts. */}
            {process.env.VERCEL === "1" && (
              <>
                <WebAnalytics />
                <SpeedInsights />
              </>
            )}
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
