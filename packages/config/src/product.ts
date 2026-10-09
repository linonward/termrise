// Product manifest: the facts code needs about the product (brand, domain,
// contacts). Each product fills it in product.config.ts at the repo root.
// User-visible copy still lives in apps/web/messages (docs/product/ux.md#internationalization).
export type ProductManifest = {
  /** Short machine name, e.g. for analytics and resource names. */
  id: string;
  /** Brand name shown in emails and auth (messages repeat it for UI copy). */
  name: string;
  /** Production domain without protocol. */
  domain: string;
  supportEmail: string;
  /** Legal operator named in the Terms and Privacy Policy. */
  operator: string;
  /** Credits a new account receives; 0 for none. messages/*.json repeat the number in copy. */
  signupBonusCredits: number;
};

export function defineProduct(manifest: ProductManifest): ProductManifest {
  if (!/^[a-z][a-z0-9-]*$/.test(manifest.id))
    throw new Error("product id must be lowercase letters, digits and dashes");
  if (manifest.domain.includes("/"))
    throw new Error("product domain must not include a protocol or path");
  if (
    !Number.isInteger(manifest.signupBonusCredits) ||
    manifest.signupBonusCredits < 0
  )
    throw new Error("product signupBonusCredits must be a whole number ≥ 0");
  return manifest;
}
