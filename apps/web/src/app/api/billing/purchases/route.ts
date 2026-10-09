import { getBillingService, toPurchaseDto } from "@/server/billing/billing";
import { userRoute } from "@/server/http/user-route";

export const GET = userRoute(async ({ user }) => {
  const list = await getBillingService().listPurchases(user.id);
  return Response.json({ purchases: list.map(toPurchaseDto) });
});
