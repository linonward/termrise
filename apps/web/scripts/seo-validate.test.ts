import { expect, it } from "vitest";

import { checkRepo } from "./seo-validate";

// seo/matrix.json must stay consistent with seo/keywords.csv, seo/briefs/ and
// the live pages (docs/product/ux.md#keyword-matrix).
it("seo/matrix.json passes validation", () => {
  expect(checkRepo()).toEqual([]);
});
