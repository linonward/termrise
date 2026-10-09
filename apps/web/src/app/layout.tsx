import type { Metadata } from "next";
import { Bricolage_Grotesque, Inter } from "next/font/google";
import { headers } from "next/headers";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";

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

// opsz: headings use the display cut (globals.css --font-heading).
const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  axes: ["opsz"],
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
      locale: (await getLocale()) === "zh" ? "zh_CN" : "en_US",
    },
    twitter: { card: "summary_large_image" },
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const messages = pickClientMessages(await getMessages());
  const nonce = (await headers()).get(NONCE_HEADER) ?? undefined;
  return (
    <html
      lang={await getLocale()}
      suppressHydrationWarning
      className={`${inter.variable} ${bricolage.variable} h-full antialiased`}
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
