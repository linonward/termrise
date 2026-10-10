import { defineProduct } from "@repo/config/product";

// The product manifest (README.md); messages/*.json and the legal pages repeat the brand
// in copy. The operator is a placeholder until the maintainer confirms it before launch.
export default defineProduct({
  id: "termrise",
  name: "Termrise",
  domain: "termrise.com",
  supportEmail: "support@termrise.com",
  operator: "Termrise",
  // Termrise does not charge yet (docs/roadmap.md#confirmed-decisions): no credits at
  // sign-up, and no pricing, billing or credits in the UI. The billing code stays.
  signupBonusCredits: 0,
  billingEnabled: false,
});
