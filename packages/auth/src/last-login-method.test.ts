import { describe, expect, it } from "vitest";

import { resolveOneTapLoginMethod } from "./last-login-method";

describe("resolveOneTapLoginMethod", () => {
  it("records One Tap sign-ins as Google", () => {
    expect(resolveOneTapLoginMethod({ path: "/one-tap/callback" })).toBe(
      "google",
    );
  });
  it("leaves other paths to the plugin defaults", () => {
    expect(resolveOneTapLoginMethod({ path: "/callback/google" })).toBeNull();
    expect(resolveOneTapLoginMethod({ path: undefined })).toBeNull();
  });
});
