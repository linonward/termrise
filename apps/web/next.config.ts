import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  // Keep `next dev` from appending its own block to AGENTS.md (pointer-only file).
  agentRules: false,
  // Workspace packages ship TypeScript source (docs/architecture/overview.md#monorepo).
  transpilePackages: [
    "@repo/admin",
    "@repo/analytics",
    "@repo/auth",
    "@repo/billing",
    "@repo/config",
    "@repo/credits",
    "@repo/observability",
    "@repo/research",
    "@repo/seo",
    "@repo/tasks",
    "@repo/ui",
  ],
  // Pages moved in S59 (docs/product/ux.md#pages): old addresses keep working.
  async redirects() {
    const moved: [string, string][] = [
      ["/dashboard", "/today"],
      ["/pool/new", "/discover"],
      ["/pool/new/:id", "/discover/:id"],
      ["/pool/rounds/:id", "/keywords/rounds/:id"],
      ["/pool/:id", "/keywords/:id"],
      ["/pool", "/keywords"],
      ["/research", "/opportunities/research"],
      ["/research/:id", "/opportunities/research/:id"],
      ["/projects", "/products"],
      ["/projects/:id", "/products/:id"],
      // Radar is off (S60): its stories are not shown any more.
      ["/radar", "/discover"],
      ["/radar/:id", "/discover"],
    ];
    return moved.map(([source, destination]) => ({
      source,
      destination,
      permanent: false,
    }));
  },
  // Same-origin PostHog endpoint (US region) so tracking blockers do not drop events.
  async rewrites() {
    return [
      {
        source: "/ingest/static/:path*",
        destination: "https://us-assets.i.posthog.com/static/:path*",
      },
      {
        source: "/ingest/array/:path*",
        destination: "https://us-assets.i.posthog.com/array/:path*",
      },
      {
        source: "/ingest/:path*",
        destination: "https://us.i.posthog.com/:path*",
      },
    ];
  },
  skipTrailingSlashRedirect: true,
  poweredByHeader: false,
  // No framing (clickjacking), plugins, <base> hijacking, cross-site form posts or MIME
  // sniffing: docs/architecture/security.md#security-headers. Script rules are report-only (proxy.ts).
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Content-Security-Policy",
            value:
              "frame-ancestors 'none'; object-src 'none'; base-uri 'none'; form-action 'self'",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

// Source maps upload only when SENTRY_AUTH_TOKEN is set (Vercel builds).
export default withSentryConfig(createNextIntlPlugin()(nextConfig), {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  widenClientFileUpload: true,
  silent: !process.env.CI,
  // Same-origin endpoint so ad blockers do not drop client errors.
  tunnelRoute: "/monitoring",
});
