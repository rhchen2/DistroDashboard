// supabase/functions/ingest/handlers/orders.ts
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import type { IngestOrdersPayload, OrderSnapshot } from "@distro/contracts";
import { recomputeHeadline } from "../lib/statusHeadline.ts";

export interface HandleOrdersResult {
  changed: number;
  errors: Array<{ distroOrderId: string; message: string }>;
}

export async function handleOrders(
  c: SupabaseClient,
  payload: IngestOrdersPayload,
): Promise<HandleOrdersResult> {
  const { data: distroRow, error: dErr } = await c.from("distros")
    .select("id").eq("slug", payload.distroSlug).single();
  if (dErr || !distroRow) {
    throw new Error(`Unknown distro slug: ${payload.distroSlug}`);
  }
  const distroId = distroRow.id;

  const errors: HandleOrdersResult["errors"] = [];
  let changed = 0;

  for (const snap of payload.rows) {
    try {
      await upsertOneOrder(c, distroId, snap);
      changed++;
    } catch (err) {
      errors.push({
        distroOrderId: snap.distroOrderId,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { changed, errors };
}

async function upsertOneOrder(
  c: SupabaseClient,
  distroId: string,
  snap: OrderSnapshot,
): Promise<void> {
  const headline = recomputeHeadline(snap);
  const earliestRelease =
    snap.items.map((i) => i.releaseDate).filter((d): d is string => !!d).sort()[0] ?? null;

  const { data: order, error: oErr } = await c.from("orders").upsert(
    {
      distro_id: distroId,
      distro_order_id: snap.distroOrderId,
      placed_at: snap.placedAt,
      status: headline,
      expected_release: earliestRelease,
      subtotal_cents: snap.totals.subtotalCents,
      tax_cents: snap.totals.taxCents,
      shipping_cents: snap.totals.shippingCents,
      total_cents: snap.totals.totalCents,
      raw_payload: snap.rawPayload,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "distro_id,distro_order_id" },
  ).select("id").single();
  if (oErr || !order) throw new Error(`orders upsert failed: ${oErr?.message}`);

  // Items: update in-place to fire price-history trigger on cost/qty changes.
  const { data: existingItems } = await c.from("order_items")
    .select("id,sku,unit_cost_cents,qty")
    .eq("order_id", order.id);
  const existing = existingItems ?? [];

  // Match incoming items to existing items: by SKU first, then by position for null-SKU.
  const existingById = new Map(existing.map((r) => [r.id, r]));
  const usedIds = new Set<string>();

  for (let i = 0; i < snap.items.length; i++) {
    const it = snap.items[i];
    // Find best match: same non-null SKU, or unmatched row at same index for null-SKU items.
    let matchId: string | undefined;
    if (it.sku != null) {
      matchId = existing.find((r) => r.sku === it.sku && !usedIds.has(r.id))?.id;
    } else {
      // null-SKU: match by position among unmatched null-SKU rows
      matchId = existing.filter((r) => r.sku == null && !usedIds.has(r.id))[0]?.id;
    }

    if (matchId) {
      usedIds.add(matchId);
      const { error: uErr } = await c.from("order_items").update({
        product_name: it.productName,
        qty: it.qty,
        unit_cost_cents: it.unitCostCents,
        line_total_cents: it.unitCostCents * it.qty,
        release_date: it.releaseDate,
      }).eq("id", matchId);
      if (uErr) throw new Error(`order_items update failed: ${uErr.message}`);
    } else {
      const { error: iErr } = await c.from("order_items").insert({
        order_id: order.id,
        sku: it.sku,
        product_name: it.productName,
        qty: it.qty,
        unit_cost_cents: it.unitCostCents,
        line_total_cents: it.unitCostCents * it.qty,
        release_date: it.releaseDate,
        status: null,
      });
      if (iErr) throw new Error(`order_items insert failed: ${iErr.message}`);
    }
  }

  // Delete items no longer in the snapshot (covers both SKU and null-SKU rows).
  for (const row of existing) {
    if (!usedIds.has(row.id)) {
      const { error: dErr } = await c.from("order_items").delete().eq("id", row.id);
      if (dErr) throw new Error(`order_items delete failed: ${dErr.message}`);
    }
  }

  // Payments: upsert by (order_id, kind, expected_date)
  for (const p of snap.payments) {
    const { data: existingPay } = await c.from("order_payments").select("id")
      .eq("order_id", order.id)
      .eq("kind", p.kind)
      .eq("expected_date", p.expectedDate)
      .limit(1);

    const matched = (existingPay ?? [])[0];

    if (matched) {
      const { error: pUpdErr } = await c.from("order_payments").update({
        expected_cents: p.expectedCents,
        actual_date: p.actualDate,
        actual_cents: p.actualCents,
        source: "scraped",
      }).eq("id", matched.id);
      if (pUpdErr) throw new Error(`order_payments update failed: ${pUpdErr.message}`);
    } else {
      const { error: pInsErr } = await c.from("order_payments").insert({
        order_id: order.id,
        kind: p.kind,
        expected_date: p.expectedDate,
        expected_cents: p.expectedCents,
        actual_date: p.actualDate,
        actual_cents: p.actualCents,
        source: "scraped",
      });
      if (pInsErr) throw new Error(`order_payments insert failed: ${pInsErr.message}`);
    }
  }

  // Shipments: replace wholesale
  const { error: shipDelErr } = await c.from("shipments").delete().eq("order_id", order.id);
  if (shipDelErr) throw new Error(`shipments delete failed: ${shipDelErr.message}`);
  if (snap.shipments.length > 0) {
    const shipRows = snap.shipments.map((s) => ({
      order_id: order.id,
      shipped_at: s.shippedAt,
      tracking: s.tracking,
      carrier: s.carrier,
      items: s.items,
    }));
    const { error: sErr } = await c.from("shipments").insert(shipRows);
    if (sErr) throw new Error(`shipments insert failed: ${sErr.message}`);
  }
}
