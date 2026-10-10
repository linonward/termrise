import "server-only";

import { TASK_CREDIT_COST } from "@repo/tasks/credit-cost";

// The only place platform code (server/, components/) reaches the product's paid
// action. Replacing the example changes features/<name>/ and this file; ESLint
// rejects other imports of @/features/* outside app/ and features/.

/** Credits one use costs; the pricing figures divide by it. */
export const CREDIT_COST_PER_USE = TASK_CREDIT_COST;
