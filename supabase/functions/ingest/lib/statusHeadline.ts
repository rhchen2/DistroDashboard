import type { OrderSnapshot, OrderStatus } from "@distro/contracts";

export function recomputeHeadline(snap: OrderSnapshot): OrderStatus {
  if (snap.status === "cancelled") return "cancelled";

  if (snap.status === "shipped" && snap.items.length > 0) {
    const shippedQtyBySku = new Map<string | null, number>();
    for (const sh of snap.shipments) {
      for (const it of sh.items) {
        shippedQtyBySku.set(it.sku, (shippedQtyBySku.get(it.sku) ?? 0) + it.qty);
      }
    }
    const fullyShipped = snap.items.every(
      (it) => (shippedQtyBySku.get(it.sku) ?? 0) >= it.qty,
    );
    if (!fullyShipped) return "partial_shipped";
  }

  return snap.status;
}
