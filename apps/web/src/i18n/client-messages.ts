import type { messages } from "./messages";

type Messages = (typeof messages)["en"];

// Namespaces that client components translate. NextIntlClientProvider serializes its
// messages into every page, so the root layout sends only these
// (client-messages.test.ts checks the list against the components).
export const CLIENT_NAMESPACES = [
  "admin",
  "auth",
  "billing",
  "cookies",
  "errorPage",
  "errors",
  "meta",
  "nav",
  "pricing",
  "status",
  "tasks",
] as const satisfies readonly (keyof Messages)[];

export function pickClientMessages(all: Messages) {
  return Object.fromEntries(CLIENT_NAMESPACES.map((key) => [key, all[key]]));
}
