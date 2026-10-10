import { requestAnalytics } from "../analytics";
import { readJson } from "../http";
import { userRoutes } from "./user-routes";

// The cookie banner choice of a signed-in user; server-side events follow it.
export const analytics = userRoutes().post("/consent", async (c) => {
  await requestAnalytics(c).updateConsent(c.var.user.id, await readJson(c));
  return c.body(null, 204);
});
