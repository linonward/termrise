// Script and connect rules, sent as Content-Security-Policy-Report-Only until the
// reports are clean (docs/architecture/security.md#content-security-policy).
// The enforced directives are static and live in next.config.ts.
export const NONCE_HEADER = "x-nonce";

export function reportOnlyCsp(options: {
  nonce: string;
  dev?: boolean;
  /** Local storage endpoint (R2_ENDPOINT); production uploads go to R2. */
  storageEndpoint?: string;
  reportUri?: string;
}) {
  const script = [`'nonce-${options.nonce}'`, "'strict-dynamic'"];
  if (options.dev) script.push("'unsafe-eval'");
  // Google One Tap; presigned PUT uploads to R2.
  const connect = [
    "'self'",
    "https://accounts.google.com",
    "https://*.r2.cloudflarestorage.com",
  ];
  if (options.storageEndpoint)
    connect.push(new URL(options.storageEndpoint).origin);
  const directives = [
    `script-src ${script.join(" ")}`,
    `connect-src ${connect.join(" ")}`,
  ];
  if (options.reportUri) directives.push(`report-uri ${options.reportUri}`);
  return directives.join("; ");
}

// Sentry's security endpoint for a DSN https://{key}@{host}/{projectId}.
export function sentryCspReportUri(dsn: string | undefined) {
  if (!dsn || !URL.canParse(dsn)) return undefined;
  const url = new URL(dsn);
  const projectId = url.pathname.slice(1);
  if (!url.username || !projectId) return undefined;
  return `${url.origin}/api/${projectId}/security/?sentry_key=${url.username}`;
}
