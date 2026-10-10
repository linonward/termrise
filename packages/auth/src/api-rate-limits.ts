// Per-user limits of the product API (docs/architecture/security.md#rate-limiting), shared
// by apps/api and the web routes not yet moved to it. The limit "task" uses the key task:{userId}.
export const API_RATE_LIMITS = {
  task: { limit: 10, windowSeconds: 60 },
  upload: { limit: 20, windowSeconds: 60 },
  checkout: { limit: 10, windowSeconds: 60 },
} as const;

export type ApiRateLimitName = keyof typeof API_RATE_LIMITS;
