// supabase/functions/ingest/index.ts
import { serve } from "https://deno.land/std@0.220.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { IngestPayloadSchema } from "@distro/contracts";
import { checkScraperToken } from "./lib/auth.ts";
import { handleOrders } from "./handlers/orders.ts";
import { handleFailure } from "./handlers/failure.ts";
import { fireRevalidate } from "./lib/revalidate.ts";

const SCRAPER_TOKEN = Deno.env.get("SCRAPER_TOKEN") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

serve(async (req) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  if (!checkScraperToken(req, SCRAPER_TOKEN)) {
    return new Response("Unauthorized", { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const parsed = IngestPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error.format() }), {
      status: 422,
      headers: { "content-type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  });

  try {
    if (parsed.data.kind === "orders") {
      const result = await handleOrders(supabase, parsed.data);
      await supabase.from("sync_runs").update({
        status: result.errors.length === 0 ? "success" : "partial",
        orders_seen: parsed.data.rows.length,
        orders_changed: result.changed,
        error_message: result.errors.length ? JSON.stringify(result.errors) : null,
        finished_at: new Date().toISOString(),
      }).eq("id", parsed.data.syncRunId);

      await fireRevalidate();
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    } else {
      await handleFailure(supabase, parsed.data);
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
});
