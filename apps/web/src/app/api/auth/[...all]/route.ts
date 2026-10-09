import { toNextJsHandler } from "better-auth/next-js";

import { withRequestContext } from "@repo/observability/logger";

import { getAuth } from "@/server/auth/auth";
export const runtime = "nodejs";
export const GET = withRequestContext(async (request: Request) => {
  return toNextJsHandler(getAuth()).GET(request);
});
export const POST = withRequestContext(async (request: Request) => {
  return toNextJsHandler(getAuth()).POST(request);
});
