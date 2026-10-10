import { getSessionCookie } from "better-auth/cookies";
import { NextRequest, NextResponse } from "next/server";

import { safeNext } from "@repo/auth/auth-redirect";

import { SIGN_IN_NEXT_HEADER } from "@/server/auth/sign-in-next";
import {
  NONCE_HEADER,
  reportOnlyCsp,
  sentryCspReportUri,
} from "@/server/http/csp";

const PROTECTED = /^\/(dashboard|billing|research|opportunities)(\/|$)/;

export async function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  // Optimistic redirect: the session cookie is present, not validated, so this reads no
  // database (docs/architecture/security.md#session-checks). The (dashboard) layout
  // validates the session and redirects an expired or forged one.
  if (PROTECTED.test(request.nextUrl.pathname)) {
    const next = safeNext(request.nextUrl.pathname + request.nextUrl.search);
    if (!getSessionCookie(request)) {
      const signIn = new URL("/sign-in", request.url);
      signIn.searchParams.set("next", next);
      return NextResponse.redirect(signIn);
    }
    headers.set(SIGN_IN_NEXT_HEADER, next);
  }
  const nonce = btoa(crypto.randomUUID());
  const csp = reportOnlyCsp({
    nonce,
    dev: process.env.NODE_ENV === "development",
    storageEndpoint: process.env.R2_ENDPOINT,
    apiUrl: process.env.NEXT_PUBLIC_API_URL,
    reportUri: sentryCspReportUri(process.env.SENTRY_DSN),
  });
  // Next.js takes the nonce for its own scripts from the request's CSP header and
  // prefers an enforced one, so drop any the client sent.
  headers.delete("content-security-policy");
  headers.set("content-security-policy-report-only", csp);
  headers.set(NONCE_HEADER, nonce);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy-Report-Only", csp);
  return response;
}

// Pages only: API routes return JSON, and static files need no nonce.
export const config = {
  matcher: [
    "/((?!api/|_next/static|_next/image|_vercel|monitoring|ingest|.*\\.(?:ico|png|svg|jpg|webp|txt|xml|woff2?)$).*)",
  ],
};
