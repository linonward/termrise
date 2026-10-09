import { LegalPage, legalMetadata } from "@/components/landing/legal-page";

export const generateMetadata = () => legalMetadata("refund");

export default function Page() {
  return <LegalPage page="refund" />;
}
