import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { safeNext } from "@repo/auth/auth-redirect";

import { IdentifyUser } from "@/components/analytics/track";
import { AppNav } from "@/components/nav/app-nav";
import { getRequestSession } from "@/server/auth/auth";
import { SIGN_IN_NEXT_HEADER } from "@/server/auth/sign-in-next";
import { balanceForUser } from "@/server/credits/credits";

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
  const balance = await balanceForUser(session.user.id);
  return (
    <>
      <IdentifyUser userId={session.user.id} />
      <AppNav email={session.user.email} balance={balance} />
      {children}
    </>
  );
}
