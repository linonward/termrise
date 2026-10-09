import { Hono } from "hono";

// Liveness check for the load balancer or uptime monitor. No database call.
export const health = new Hono().get("/", (c) => c.json({ status: "ok" }));
