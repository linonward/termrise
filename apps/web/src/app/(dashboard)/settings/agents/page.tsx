import { getTranslations } from "next-intl/server";

import {
  AgentTokens,
  type AgentTokenItem,
} from "@/features/settings/agent-tokens";
import { apiGet } from "@/server/api/api";

export async function generateMetadata() {
  return { title: (await getTranslations("agentTokens"))("metaTitle") };
}

// Tokens for AI agents that work for the maintainer through the API
// (docs/product/ux.md#agent-tokens).
export default async function AgentTokensPage() {
  const t = await getTranslations("agentTokens");
  const { items } = await apiGet<{ items: AgentTokenItem[] }>(
    "/api/settings/agent-tokens",
  );
  return (
    <main className="mx-auto w-full max-w-310 space-y-8 px-5 py-8 md:py-12">
      <header className="space-y-2">
        <h1 className="font-heading text-[28px] font-semibold tracking-tight md:text-4xl">
          {t("title")}
        </h1>
        <p className="max-w-[65ch] text-[15px] text-muted-foreground">
          {t("subtitle")}
        </p>
      </header>
      <AgentTokens items={items} />
    </main>
  );
}
