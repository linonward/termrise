// The UI is Chinese only (docs/product/ux.md#internationalization). apps/web shows
// its copy in this language, apps/api writes auth emails in it.
export const LOCALE = "zh" as const;
export type Locale = typeof LOCALE;
