import type { Metadata } from "next";

import { AuthPage } from "@/components/auth/auth-page";

export const metadata: Metadata = { robots: { index: false } };

export default function LoginPage({ searchParams }: PageProps<"/sign-in">) {
  return <AuthPage mode="login" searchParams={searchParams} />;
}
