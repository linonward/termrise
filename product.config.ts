import { defineProduct } from "@repo/config/product";

// The product manifest. Replace these values when you create a product from the
// starter (README.md); messages/*.json and the legal pages repeat the brand in copy.
export default defineProduct({
  id: "acme",
  name: "Acme",
  domain: "example.com",
  supportEmail: "support@example.com",
  operator: "Acme Inc.",
  signupBonusCredits: 10,
});
