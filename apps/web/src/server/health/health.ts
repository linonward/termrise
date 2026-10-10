import "server-only";
import { db } from "@repo/db/client";
import { checkDatabase } from "@repo/db/health";

export const checkHealth = () => checkDatabase(db());
