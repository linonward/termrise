import type { Metadata } from "next";

import { AuthPage } from "@/components/auth/auth-page";

export const metadata: Metadata = { robots: { index: false } };

export default function SignupPage({ searchParams }: PageProps<"/sign-up">) {
  return <AuthPage mode="signup" searchParams={searchParams} />;
}
