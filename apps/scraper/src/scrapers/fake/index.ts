import type { Scraper } from "@distro/contracts";

// TEMP: removed after GTS scraper lands in Phase 5.
export const fakeScraper: Scraper = {
  slug: "gts",                // pretend to be GTS so distro FK resolves
  displayName: "Fake (dev)",
  async login() { /* noop */ },
  async fetchOrders() {
    return [
      {
        distroOrderId: "FAKE-PO-1",
        placedAt: "2026-05-13",
        status: "open" as const,
        totals: { subtotalCents: 12000, taxCents: 0, shippingCents: 500, totalCents: 12500 },
        items: [{
          sku: "FAKE-1", productName: "Fake Booster Box", qty: 6,
          unitCostCents: 2000, releaseDate: "2026-06-15",
        }],
        payments: [{
          kind: "deposit" as const, expectedDate: "2026-05-20",
          expectedCents: 5000, actualDate: null, actualCents: null,
        }],
        shipments: [],
        rawPayload: { source: "fake-scraper" },
      },
    ];
  },
};
