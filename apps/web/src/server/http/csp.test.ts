import { expect, it } from "vitest";

import { reportOnlyCsp, sentryCspReportUri } from "./csp";

it("allows only scripts with the request nonce and the scripts they load", () => {
  expect(reportOnlyCsp({ nonce: "abc" })).toBe(
    "script-src 'nonce-abc' 'strict-dynamic'; connect-src 'self' https://accounts.google.com https://*.r2.cloudflarestorage.com",
  );
});

it("allows eval in development for React Refresh", () => {
  expect(reportOnlyCsp({ nonce: "abc", dev: true })).toContain(
    "script-src 'nonce-abc' 'strict-dynamic' 'unsafe-eval';",
  );
});

it("allows uploads to the local storage endpoint", () => {
  expect(
    reportOnlyCsp({ nonce: "abc", storageEndpoint: "http://localhost:8333/" }),
  ).toContain("https://*.r2.cloudflarestorage.com http://localhost:8333");
});

it("reports violations when a report URI is given", () => {
  expect(
    reportOnlyCsp({ nonce: "abc", reportUri: "https://r.example/csp" }),
  ).toMatch(/; report-uri https:\/\/r\.example\/csp$/);
});

it("builds the Sentry security endpoint from the DSN", () => {
  expect(
    sentryCspReportUri("https://pub123@o42.ingest.us.sentry.io/4507"),
  ).toBe(
    "https://o42.ingest.us.sentry.io/api/4507/security/?sentry_key=pub123",
  );
  expect(sentryCspReportUri(undefined)).toBeUndefined();
  expect(sentryCspReportUri("not a url")).toBeUndefined();
});
