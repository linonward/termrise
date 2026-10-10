// Bindings of the Worker (wrangler.jsonc). Workers have no process.env for these:
// read them from c.env in a route, never from a package.
export type Bindings = {
  /** Hyperdrive in front of Neon; locally CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE. */
  HYPERDRIVE: { connectionString: string };
};

export type AppEnv = { Bindings: Bindings };
