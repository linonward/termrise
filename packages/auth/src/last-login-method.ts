// better-auth's lastLoginMethod plugin keeps this cookie (default name) so the
// sign-in page can mark the method the browser used last.
export const LAST_LOGIN_METHOD_COOKIE = "better-auth.last_used_login_method";

// The plugin resolves OAuth callbacks and magic links itself, but not One Tap.
export function resolveOneTapLoginMethod(ctx: { path?: string }) {
  return ctx.path === "/one-tap/callback" ? "google" : null;
}
