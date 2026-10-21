import { expect, it } from "vitest";

import { LOCALE } from "./locale";

it("uses Chinese only", () => expect(LOCALE).toBe("zh"));
