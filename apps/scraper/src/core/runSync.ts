import type { Scraper, ScraperRunContext } from "@distro/contracts";
import { isSuspiciousZero } from "./tripwire.js";

export interface SyncRunCloseArgs {
  status: "success" | "partial" | "error";
  ordersSeen: number;
  ordersChanged: number;
  errorMessage: string | null;
}

export interface RunSyncDeps {
  openContext: (slug: string) => Promise<ScraperRunContext & { close: () => Promise<void> }>;
  createSyncRun: (slug: string) => Promise<string>;
  closeSyncRun: (syncRunId: string, args: SyncRunCloseArgs) => Promise<void>;
  lastSuccessfulCount: (slug: string) => Promise<number | null>;
  postOrders: (args: {
    distroSlug: string;
    syncRunId: string;
    rows: import("@distro/contracts").OrderSnapshot[];
  }) => Promise<{ changed: number }>;
  postFailure: (args: {
    distroSlug: string;
    syncRunId: string;
    error: string;
    screenshotBase64: string | null;
  }) => Promise<void>;
  takeScreenshot: (
    ctx: ScraperRunContext & { close: () => Promise<void> },
  ) => Promise<string | null>;
}

export async function runSync(scrapers: Scraper[], deps: RunSyncDeps): Promise<void> {
  for (const scraper of scrapers) {
    const syncRunId = await deps.createSyncRun(scraper.slug);
    let ctx: (ScraperRunContext & { close: () => Promise<void> }) | undefined;
    try {
      ctx = await deps.openContext(scraper.slug);
      await scraper.login(ctx);
      const rows = await scraper.fetchOrders(ctx);

      const prior = await deps.lastSuccessfulCount(scraper.slug);
      if (isSuspiciousZero(rows.length, prior)) {
        await deps.closeSyncRun(syncRunId, {
          status: "partial",
          ordersSeen: 0,
          ordersChanged: 0,
          errorMessage: `zero orders returned (prior successful run had ${prior})`,
        });
        continue;
      }

      const result = await deps.postOrders({ distroSlug: scraper.slug, syncRunId, rows });
      await deps.closeSyncRun(syncRunId, {
        status: "success",
        ordersSeen: rows.length,
        ordersChanged: result.changed,
        errorMessage: null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      let screenshot: string | null = null;
      if (ctx) {
        try { screenshot = await deps.takeScreenshot(ctx); } catch { /* ignore */ }
      }
      await deps.postFailure({ distroSlug: scraper.slug, syncRunId, error: message, screenshotBase64: screenshot });
      await deps.closeSyncRun(syncRunId, {
        status: "error", ordersSeen: 0, ordersChanged: 0, errorMessage: message,
      });
    } finally {
      if (ctx) { try { await ctx.close(); } catch { /* ignore */ } }
    }
  }
}
