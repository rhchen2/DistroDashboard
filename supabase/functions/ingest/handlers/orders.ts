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

  // Items: update in place (to trigger price-history DB trigger), insert new, delete removed
  // The DB trigger record_order_item_history fires on UPDATE when cost/qty changes.
  if (snap.items.length > 0 || (await c.from("order_items").select("id").eq("order_id", order.id)).data?.length) {
    const { data: existingItems } = await c.from("order_items").select("id,sku,unit_cost_cents,qty")
      .eq("order_id", order.id);
    const existingBySku = new Map<string, { id: string; unit_cost_cents: number; qty: number }>();
    for (const row of existingItems ?? []) {
      if (row.sku != null) existingBySku.set(row.sku, { id: row.id, unit_cost_cents: row.unit_cost_cents, qty: row.qty });
    }

    const incomingSkus = new Set(snap.items.map((i) => i.sku).filter((s): s is string => s != null));

    // Update or insert each incoming item
    for (const it of snap.items) {
      const existing = it.sku != null ? existingBySku.get(it.sku) : undefined;
      if (existing) {
        const { error: uErr } = await c.from("order_items").update({
          product_name: it.productName,
          qty: it.qty,
          unit_cost_cents: it.unitCostCents,
          line_total_cents: it.unitCostCents * it.qty,
          release_date: it.releaseDate,
        }).eq("id", existing.id);
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

    // Delete items that are no longer in the snapshot
    for (const [sku, row] of existingBySku) {
      if (!incomingSkus.has(sku)) {
        await c.from("order_items").delete().eq("id", row.id);
      }
    }
  }

  // Payments: upsert by (order_id, kind, expected_date)
  for (const p of snap.payments) {
    const { data: existing } = await c.from("order_payments").select("id")
      .eq("order_id", order.id)
      .eq("kind", p.kind)
      .eq("expected_date", p.expectedDate)
      .limit(1);

    const matched = (existing ?? [])[0];

    if (matched) {
      await c.from("order_payments").update({
        expected_cents: p.expectedCents,
        actual_date: p.actualDate,
        actual_cents: p.actualCents,
        source: "scraped",
      }).eq("id", matched.id);
    } else {
      await c.from("order_payments").insert({
        order_id: order.id,
        kind: p.kind,
        expected_date: p.expectedDate,
        expected_cents: p.expectedCents,
        actual_date: p.actualDate,
        actual_cents: p.actualCents,
        source: "scraped",
      });
    }
  }

  // Shipments: replace wholesale
  await c.from("shipments").delete().eq("order_id", order.id);
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
