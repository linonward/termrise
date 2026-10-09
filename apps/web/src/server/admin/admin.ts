import "server-only";
import { db } from "@repo/db/client";

import { listPaidRecords } from "@/server/product";

import { createAdminService } from "./admin-service";

export const getAdminService = () =>
  createAdminService(db(), { listTasks: listPaidRecords });
