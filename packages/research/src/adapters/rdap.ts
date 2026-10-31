// When a domain was registered, from RDAP (the registries' public protocol, RFC 9083),
// through the rdap.org bootstrap redirect. Free and keyless; a lookup that fails is
// null, never a guess.
export type DomainAge = { domain: string; registeredOn: string | null };

/** The registrable part of a host: example.co.uk stays, www.example.com → example.com. */
export function registrableDomain(host: string) {
  const parts = host
    .toLowerCase()
    .replace(/^www\./, "")
    .split(".");
  const twoLevel =
    /^(co|com|org|net|ac|gov|edu)$/.test(parts.at(-2) ?? "") &&
    parts.at(-1)!.length === 2;
  return parts.slice(twoLevel ? -3 : -2).join(".");
}

export function createRdapClient(
  deps: { fetch?: typeof fetch; timeoutMs?: number } = {},
) {
  const fetcher = deps.fetch ?? globalThis.fetch;
  return {
    async registeredOn(domain: string): Promise<DomainAge> {
      try {
        const res = await fetcher(
          `https://rdap.org/domain/${encodeURIComponent(domain)}`,
          {
            headers: { accept: "application/rdap+json" },
            signal: AbortSignal.timeout(deps.timeoutMs ?? 10_000),
          },
        );
        if (!res.ok) return { domain, registeredOn: null };
        const body = (await res.json()) as {
          events?: { eventAction?: string; eventDate?: string }[];
        };
        const event = body.events?.find(
          (e) => e.eventAction === "registration",
        );
        return { domain, registeredOn: event?.eventDate?.slice(0, 10) ?? null };
      } catch {
        return { domain, registeredOn: null };
      }
    },
  };
}

export type RdapClient = ReturnType<typeof createRdapClient>;
