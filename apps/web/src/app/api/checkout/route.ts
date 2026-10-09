import { getBillingService } from "@/server/billing/billing";
import { readJson } from "@/server/http/respond";
import { userRoute } from "@/server/http/user-route";

export const POST = userRoute(
  { rateLimit: "checkout" },
  async ({ request, user }) =>
    Response.json(
      await getBillingService().createCheckout(user, await readJson(request)),
      { status: 201 },
    ),
);
