import { expect, it, vi } from "vitest";

import { AuthError } from "@repo/auth/guards";
import { AppError } from "@repo/observability/errors";

import { createUserRoute } from "./route";

const user = { id: "u1", email: "u1@example.com" };

function setup(signedIn = true) {
  const enforce = vi.fn(async () => {});
  const userRoute = createUserRoute({
    requireUser: async () => {
      if (!signedIn) throw new AuthError("UNAUTHORIZED", 401);
      return user;
    },
    enforceRateLimit: enforce,
  });
  return { userRoute, enforce };
}

const request = () =>
  new Request("http://localhost/api/x", { method: "POST", body: "{}" });

it("passes the signed-in user and the request to the handler", async () => {
  const { userRoute } = setup();
  const handler = vi.fn(async () => Response.json({ ok: true }));
  const response = await userRoute(handler)(request());
  expect(response.status).toBe(200);
  expect(handler).toHaveBeenCalledWith(
    expect.objectContaining({ user, request: expect.any(Request) }),
  );
});

it("answers 401 without a session and does not call the handler", async () => {
  const { userRoute, enforce } = setup(false);
  const handler = vi.fn(async () => Response.json({}));
  const response = await userRoute({ rateLimit: "task" }, handler)(request());
  expect(response.status).toBe(401);
  expect((await response.json()).error.code).toBe("UNAUTHORIZED");
  expect(enforce).not.toHaveBeenCalled();
  expect(handler).not.toHaveBeenCalled();
});

it("checks the rate limit per user before the handler", async () => {
  const { userRoute, enforce } = setup();
  const handler = vi.fn(async () => Response.json({}));
  await userRoute({ rateLimit: "task" }, handler)(request());
  await userRoute(
    { rateLimit: { limit: "checkout", key: "subscription-cancel" } },
    handler,
  )(request());
  expect(enforce.mock.calls).toEqual([
    ["task", "task:u1"],
    ["checkout", "subscription-cancel:u1"],
  ]);
});

it("maps errors from the rate limit and the handler to the error contract", async () => {
  const { userRoute, enforce } = setup();
  enforce.mockRejectedValueOnce(
    new AppError("RATE_LIMITED", "Too many requests", 30),
  );
  const limited = await userRoute({ rateLimit: "task" }, async () =>
    Response.json({}),
  )(request());
  expect(limited.status).toBe(429);
  expect(limited.headers.get("Retry-After")).toBe("30");

  const invalid = await userRoute(async () => {
    throw new AppError("INVALID_INPUT");
  })(request());
  expect(invalid.status).toBe(400);
});
