import type { SiteOpsExport } from "@repo/execution/sites";
import { logger } from "@repo/observability/logger";

// Copies site-ops's export into the workbench (docs/architecture/data-model.md#sites).
// Without a configured sync (SITES_SYNC_ENABLED unset) the job fails, so a stale schedule shows.
export function sitesProcessors(deps: {
  siteSync?: {
    fetch: () => Promise<SiteOpsExport>;
    sync: (exp: SiteOpsExport) => Promise<{ sites: number; daily: number }>;
    /** Reads domains' expiry from RDAP; a failure here does not fail the sync. */
    refreshDomains?: () => Promise<{ checked: number; failed: number }>;
  };
}) {
  return {
    async "sites.sync"() {
      if (!deps.siteSync) throw new Error("Site sync is disabled");
      const result = await deps.siteSync.sync(await deps.siteSync.fetch());
      logger.info("sites.synced", result);
      if (!deps.siteSync.refreshDomains) return;
      try {
        const domains = await deps.siteSync.refreshDomains();
        if (domains.checked) logger.info("domains.checked", domains);
      } catch (error) {
        logger.warn("domains.check_failed", { error });
      }
    },
  };
}
