import type { OrderSnapshot } from "./orderSnapshot.js";

// Loose context type so this package stays Deno-compatible (no Playwright dep).
// Concrete Scraper implementations narrow this.
export interface ScraperRunContext {
  [key: string]: unknown;
}

export interface Scraper {
  readonly slug: string;
  readonly displayName: string;
  login(ctx: ScraperRunContext): Promise<void>;
  fetchOrders(ctx: ScraperRunContext): Promise<OrderSnapshot[]>;
}
