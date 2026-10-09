import { getAnalyticsService } from "@/server/analytics/analytics";
import { readJson } from "@/server/http/respond";
import { userRoute } from "@/server/http/user-route";

// The cookie banner choice of a signed-in user; server-side events follow it.
export const POST = userRoute(async ({ request, user }) => {
  await getAnalyticsService().updateConsent(user.id, await readJson(request));
  return new Response(null, { status: 204 });
});
