import { createHash } from "node:crypto";
import { isIPv6 } from "node:net";

import { APIError } from "better-auth/api";

import { AppError } from "@repo/observability/errors";

import { MAGIC_LINK_LIMITS, type createRateLimitService } from "./rate-limit";

type RateLimitService = ReturnType<typeof createRateLimitService>;

// Magic Link limits in Postgres, not Better Auth's per-instance memory:
// docs/architecture/security.md#rate-limiting.
export function createMagicLinkLimiter(rateLimit: RateLimitService) {
  async function check(
    key: string,
    rule: { limit: number; windowSeconds: number },
    code: string,
  ) {
    try {
      await rateLimit.enforce(key, rule.limit, rule.windowSeconds);
    } catch (error) {
      if (!(error instanceof AppError) || error.code !== "RATE_LIMITED")
        throw error;
      throw new APIError(
        "TOO_MANY_REQUESTS",
        { code, message: "Too many sign-in emails" },
        { "Retry-After": String(error.retryAfterSeconds ?? 60) },
      );
    }
  }
  return async (email: string, headers: Headers) => {
    // Hash the address so rate_limits never holds an email.
    const hash = createHash("sha256")
      .update(email.trim().toLowerCase())
      .digest("hex");
    await check(
      `magic-link:email:${hash}`,
      MAGIC_LINK_LIMITS.magicLinkEmail,
      "RATE_LIMITED",
    );
    // Vercel sets x-forwarded-for; the first entry is the client.
    const ip = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    if (ip) {
      const key = ipKey(ip);
      await check(
        `magic-link:ip:${key}`,
        MAGIC_LINK_LIMITS.magicLinkIp,
        "RATE_LIMITED",
      );
      await check(
        `magic-link:ip-day:${key}`,
        MAGIC_LINK_LIMITS.magicLinkIpDaily,
        "RATE_LIMITED",
      );
    }
    await check(
      "magic-link:daily",
      MAGIC_LINK_LIMITS.magicLinkDaily,
      "MAGIC_LINK_DAILY_LIMIT",
    );
  };
}

// One IPv6 /64 is usually one subscriber, who can use every address in it.
function ipKey(ip: string) {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (mapped) return mapped[1];
  if (!isIPv6(ip)) return ip;
  const [head = "", tail] = ip.split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const groups =
    tail === undefined
      ? left
      : [...left, ...Array(8 - left.length - right.length).fill("0"), ...right];
  const prefix = groups
    .slice(0, 4)
    .map((group) => parseInt(group, 16).toString(16))
    .join(":");
  return `${prefix}::/64`;
}
