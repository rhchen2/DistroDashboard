import type { OrderSnapshot } from "@distro/contracts";

export function makeOrderSnapshot(overrides: Partial<OrderSnapshot> = {}): OrderSnapshot {
  return {
    distroOrderId: "PO-TEST",
    placedAt: "2026-04-12",
    status: "open",
    totals: { subtotalCents: 1000, taxCents: 0, shippingCents: 0, totalCents: 1000 },
    items: [],
    payments: [],
    shipments: [],
    rawPayload: null,
    ...overrides,
  };
}
