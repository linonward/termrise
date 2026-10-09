import { LegalPage, legalMetadata } from "@/components/landing/legal-page";

export const generateMetadata = () => legalMetadata("terms");

export default function Page() {
  return <LegalPage page="terms" />;
}
