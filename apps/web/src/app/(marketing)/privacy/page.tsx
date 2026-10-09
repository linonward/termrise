import { LegalPage, legalMetadata } from "@/components/landing/legal-page";

export const generateMetadata = () => legalMetadata("privacy");

export default function Page() {
  return <LegalPage page="privacy" />;
}
