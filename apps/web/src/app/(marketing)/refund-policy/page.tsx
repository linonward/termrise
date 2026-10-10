import { notFound } from "next/navigation";

import { LegalPage, legalMetadata } from "@/components/landing/legal-page";
import product from "@product";

export const generateMetadata = () => legalMetadata("refund");

// The refund rules cover purchases: hidden while the product does not charge.
export default function Page() {
  if (!product.billingEnabled) notFound();
  return <LegalPage page="refund" />;
}
