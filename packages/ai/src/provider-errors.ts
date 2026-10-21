// A provider refused the credentials (HTTP 401 or its own auth status). Such a call is
// not billed, so its budget reservation is released, and the run reports the key as the
// cause. The message holds only the provider and the status, never the key.
export class ProviderAuthError extends Error {
  override name = "ProviderAuthError";
}
