// Google's search suggestions for a phrase (US, English): how people finish it, e.g.
// "... not working" or "... treasury direct". Free and unofficial; an error gives none.
import { z } from "zod";

export type Autocomplete = (phrase: string) => Promise<string[]>;

export function createGoogleAutocomplete(
  deps: { fetch?: typeof fetch; baseUrl?: string } = {},
): Autocomplete {
  const fetcher = deps.fetch ?? fetch;
  const base =
    deps.baseUrl ?? "https://suggestqueries.google.com/complete/search";
  return async (phrase) => {
    const query = new URLSearchParams({
      client: "firefox",
      hl: "en",
      gl: "us",
      q: phrase,
    });
    const res = await fetcher(`${base}?${query}`, {
      headers: { "user-agent": "termrise-autocomplete/1.0" },
      signal: AbortSignal.timeout(8_000),
    }).catch(() => null);
    if (!res?.ok) return [];
    const parsed = z
      .tuple([z.string(), z.array(z.string())])
      .rest(z.unknown())
      .safeParse(await res.json().catch(() => null));
    if (!parsed.success) return [];
    return parsed.data[1].filter((s) => s !== phrase).slice(0, 10);
  };
}
