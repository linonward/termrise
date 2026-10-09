import { toCreditActivityDto } from "@repo/credits/credit-activity";

import { getCreditService } from "@/server/credits/credits";
import { userRoute } from "@/server/http/user-route";

export const GET = userRoute(async ({ request, user }) => {
  const cursor = new URL(request.url).searchParams.get("cursor") ?? undefined;
  const { items, nextCursor } = await getCreditService().listActivity(
    user.id,
    cursor,
  );
  return Response.json({
    transactions: items.map(toCreditActivityDto),
    nextCursor,
  });
});
