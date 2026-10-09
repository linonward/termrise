// Request header that src/proxy.ts sets to the requested path, so the (dashboard)
// layout can send an invalid session back to the same page after sign-in.
// The proxy replaces any value the client sends.
export const SIGN_IN_NEXT_HEADER = "x-sign-in-next";
