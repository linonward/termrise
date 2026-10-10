import {
  createProviderStatus,
  toProviderStatusDto,
} from "@repo/research/provider-status";

import { userRoutes } from "./user-routes";

// The services the worker runs and what the user's projects spent on each provider
// (docs/architecture/data-model.md#worker-heartbeats).
export const settingsRoutes = userRoutes().get("/providers", async (c) =>
  c.json(
    toProviderStatusDto(
      await createProviderStatus({ database: c.var.db }).forUser(c.var.user.id),
    ),
  ),
);
