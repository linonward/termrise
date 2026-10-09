import "server-only";
import { db } from "@repo/db/client";

import { checkDatabase } from "./health-check";

export const checkHealth = () => checkDatabase(db());
