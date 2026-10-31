import { expect, it } from "vitest";

import { pageAccess } from "./page-judge";

it("tells a dead page from one it could not read", () => {
  const text = "x".repeat(200);
  expect(pageAccess({ status: 200, text })).toBe("ok");
  expect(pageAccess({ status: 404, text: "" })).toBe("gone");
  expect(pageAccess({ status: 410, text: "" })).toBe("gone");
  expect(pageAccess({ status: 403, text })).toBe("unreadable");
  expect(pageAccess({ status: 503, text })).toBe("unreadable");
  expect(pageAccess({ status: null, text: "" })).toBe("unreadable");
  // A script shell with almost no text.
  expect(pageAccess({ status: 200, text: "Loading" })).toBe("unreadable");
});
