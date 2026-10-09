import { expect, it } from "vitest";

import { CreditError, type CreditErrorCode } from "./credit-service";

it("carries one of the known codes", () => {
  const codes: CreditErrorCode[] = [
    "INVALID_CREDIT_AMOUNT",
    "INVALID_CREDIT_OPERATION",
    "CREDIT_RESOURCE_NOT_FOUND",
    "INSUFFICIENT_CREDITS",
    "IDEMPOTENCY_CONFLICT",
  ];
  for (const code of codes) expect(new CreditError(code).code).toBe(code);
  // @ts-expect-error: pnpm typecheck rejects a code that CreditService never throws.
  expect(new CreditError("NOT_A_CREDIT_CODE").code).toBe("NOT_A_CREDIT_CODE");
});
