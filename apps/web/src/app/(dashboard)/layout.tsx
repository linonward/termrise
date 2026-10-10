import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { safeNext } from "@repo/auth/auth-redirect";

import { IdentifyUser } from "@/components/analytics/track";
import { AppNav } from "@/components/nav/app-nav";
import { getBalance } from "@/server/api/api";
import { getRequestSession } from "@/server/auth/auth";
import { SIGN_IN_NEXT_HEADER } from "@/server/auth/sign-in-next";
import product from "@product";

// Signed-in pages (/dashboard, /billing). src/proxy.ts redirects visitors without a
// session cookie; this check validates the session itself.
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getRequestSession();
  if (!session) {
    const next = safeNext((await headers()).get(SIGN_IN_NEXT_HEADER));
    redirect(`/sign-in?next=${encodeURIComponent(next)}`);
  }
  // No credits pill while the product does not charge (product.config.ts billingEnabled).
  const balance = product.billingEnabled ? await getBalance() : undefined;
  return (
    <>
      <IdentifyUser userId={session.user.id} />
      <AppNav email={session.user.email} balance={balance} />
      {children}
    </>
  );
}
