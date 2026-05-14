import { assertEquals } from "https://deno.land/std@0.220.0/assert/mod.ts";
import { recomputeHeadline } from "../lib/statusHeadline.ts";
import type { OrderSnapshot } from "@distro/contracts";

const base: OrderSnapshot = {
  distroOrderId: "X",
  placedAt: "2026-04-01",
  status: "open",
  totals: { subtotalCents: 0, taxCents: 0, shippingCents: 0, totalCents: 0 },
  items: [],
  payments: [],
  shipments: [],
  rawPayload: null,
};

Deno.test("trusts scraped status when no shipments or payments contradict", () => {
  assertEquals(recomputeHeadline({ ...base, status: "open" }), "open");
  assertEquals(recomputeHeadline({ ...base, status: "invoiced" }), "invoiced");
});

Deno.test("collapses to delivered when shipments + payments imply done", () => {
  const snap: OrderSnapshot = {
    ...base,
    status: "shipped",
    payments: [{
      kind: "full", expectedDate: null, expectedCents: 100,
      actualDate: "2026-04-15", actualCents: 100,
    }],
    shipments: [{ shippedAt: "2026-04-16", tracking: "1Z", carrier: "UPS", items: [] }],
  };
  assertEquals(recomputeHeadline(snap), "shipped");
});

Deno.test("promotes shipped → partial_shipped if any item is pending", () => {
  const snap: OrderSnapshot = {
    ...base,
    status: "shipped",
    items: [
      { sku: "A", productName: "A", qty: 1, unitCostCents: 100, releaseDate: null },
      { sku: "B", productName: "B", qty: 1, unitCostCents: 100, releaseDate: null },
    ],
    shipments: [{
      shippedAt: "2026-04-16", tracking: null, carrier: null,
      items: [{ sku: "A", qty: 1 }],
    }],
  };
  assertEquals(recomputeHeadline(snap), "partial_shipped");
});

Deno.test("respects cancelled regardless of other fields", () => {
  assertEquals(recomputeHeadline({ ...base, status: "cancelled" }), "cancelled");
});
