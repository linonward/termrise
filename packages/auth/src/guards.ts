import type { createAuth } from "./create-auth";

export class AuthError extends Error {
  constructor(
    public code: "UNAUTHORIZED",
    public status: 401,
  ) {
    super(code);
  }
}

export function createAuthGuards(auth: ReturnType<typeof createAuth>) {
  async function requireUser(headers: Headers) {
    const session = await auth.api.getSession({ headers });
    if (!session) throw new AuthError("UNAUTHORIZED", 401);
    return session.user;
  }
  return { requireUser };
}
