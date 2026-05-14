// supabase/functions/ingest/tests/orders.test.ts
import { assertEquals, assertExists } from "https://deno.land/std@0.220.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { handleOrders } from "../handlers/orders.ts";
import type { IngestOrdersPayload } from "@distro/contracts";

const SUPA_URL = Deno.env.get("SUPABASE_URL") ?? "http://127.0.0.1:54321";
const SVC = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

function client() {
  return createClient(SUPA_URL, SVC, { auth: { persistSession: false } });
}

const validUuid = crypto.randomUUID();

const samplePayload = (overrides: Partial<IngestOrdersPayload> = {}): IngestOrdersPayload => ({
  kind: "orders",
  distroSlug: "gts",
  syncRunId: validUuid,
  rows: [
    {
      distroOrderId: "PO-TEST-1",
      placedAt: "2026-04-12",
      status: "invoiced",
      totals: { subtotalCents: 12000, taxCents: 0, shippingCents: 500, totalCents: 12500 },
      items: [{
        sku: "TEST-BOX", productName: "Test Box", qty: 2,
        unitCostCents: 6000, releaseDate: "2026-06-01",
      }],
      payments: [{
        kind: "deposit", expectedDate: "2026-04-20", expectedCents: 5000,
        actualDate: null, actualCents: null,
      }],
      shipments: [],
      rawPayload: { test: true },
    },
  ],
  ...overrides,
});

async function cleanup() {
  const c = client();
  await c.from("orders").delete().eq("distro_order_id", "PO-TEST-1");
  await c.from("sync_runs").delete().eq("id", validUuid);
}

Deno.test({ name: "handleOrders inserts a new order with items + payments", sanitizeOps: false, sanitizeResources: false, fn: async () => {
  await cleanup();
  const c = client();
  const result = await handleOrders(c, samplePayload());
  assertEquals(result.changed, 1);

  const { data: orders } = await c.from("orders").select("*")
    .eq("distro_order_id", "PO-TEST-1");
  assertEquals(orders?.length, 1);
  const orderId = orders![0].id;

  const { data: items } = await c.from("order_items").select("*").eq("order_id", orderId);
  assertEquals(items?.length, 1);
  assertEquals(items![0].unit_cost_cents, 6000);

  const { data: pays } = await c.from("order_payments").select("*").eq("order_id", orderId);
  assertEquals(pays?.length, 1);
  assertEquals(pays![0].expected_cents, 5000);

  await cleanup();
}});

Deno.test({ name: "handleOrders is idempotent — second call with same payload does not duplicate", sanitizeOps: false, sanitizeResources: false, fn: async () => {
  await cleanup();
  const c = client();
  await handleOrders(c, samplePayload());
  await handleOrders(c, samplePayload());

  const { data: orders } = await c.from("orders").select("id")
    .eq("distro_order_id", "PO-TEST-1");
  assertEquals(orders?.length, 1);

  await cleanup();
}});

Deno.test({ name: "handleOrders fills actual_date on existing payment when scrape sees it charged", sanitizeOps: false, sanitizeResources: false, fn: async () => {
  await cleanup();
  const c = client();
  await handleOrders(c, samplePayload());

  const updated = samplePayload();
  updated.rows[0].payments[0] = {
    ...updated.rows[0].payments[0],
    actualDate: "2026-04-21",
    actualCents: 5000,
  };
  await handleOrders(c, updated);

  const { data: orderRow } = await c.from("orders").select("id")
    .eq("distro_order_id", "PO-TEST-1").single();
  const { data: pays } = await c.from("order_payments").select("*")
    .eq("order_id", orderRow!.id);

  assertEquals(pays?.length, 1);
  assertEquals(pays![0].actual_date, "2026-04-21");
  assertEquals(pays![0].actual_cents, 5000);

  await cleanup();
}});

Deno.test({ name: "handleOrders triggers price-history when unit_cost_cents changes", sanitizeOps: false, sanitizeResources: false, fn: async () => {
  await cleanup();
  const c = client();
  await handleOrders(c, samplePayload());

  const cheaper = samplePayload();
  cheaper.rows[0].items[0] = { ...cheaper.rows[0].items[0], unitCostCents: 5500 };
  await handleOrders(c, cheaper);

  const { data: orderRow } = await c.from("orders").select("id")
    .eq("distro_order_id", "PO-TEST-1").single();
  const { data: items } = await c.from("order_items").select("id")
    .eq("order_id", orderRow!.id);
  const { data: hist } = await c.from("order_item_history").select("*")
    .eq("order_item_id", items![0].id);

  assertExists(hist);
  assertEquals(hist!.length >= 1, true);
  assertEquals(hist!.some((h) => h.unit_cost_cents === 5500), true);

  await cleanup();
}});
