import { expect, it } from "vitest";

import { defineProduct } from "./product";

const valid = {
  id: "acme",
  name: "Acme",
  domain: "example.com",
  supportEmail: "support@example.com",
  operator: "Acme Inc.",
  signupBonusCredits: 10,
};

it("returns a valid manifest unchanged", () => {
  expect(defineProduct(valid)).toEqual(valid);
});

it("rejects a signup bonus that is not a whole number of credits", () => {
  for (const signupBonusCredits of [-1, 1.5, NaN])
    expect(() => defineProduct({ ...valid, signupBonusCredits })).toThrow(
      /signupBonusCredits/,
    );
  expect(defineProduct({ ...valid, signupBonusCredits: 0 })).toMatchObject({
    signupBonusCredits: 0,
  });
});

it("rejects an id with capitals or spaces, and a domain with a protocol", () => {
  expect(() => defineProduct({ ...valid, id: "My App" })).toThrow(/id/);
  expect(() =>
    defineProduct({ ...valid, domain: "https://example.com" }),
  ).toThrow(/domain/);
});
