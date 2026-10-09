// Per-user limits of the product API (docs/architecture/security.md#rate-limiting).
// userRoute({ rateLimit: "task" }) uses the key task:{userId}.
export const API_RATE_LIMITS = {
  task: { limit: 10, windowSeconds: 60 },
  upload: { limit: 20, windowSeconds: 60 },
  checkout: { limit: 10, windowSeconds: 60 },
} as const;

export type ApiRateLimitName = keyof typeof API_RATE_LIMITS;
