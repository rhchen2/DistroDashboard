// supabase/functions/ingest/index.ts
import { serve } from "https://deno.land/std@0.220.0/http/server.ts";

const SCRAPER_TOKEN = Deno.env.get("SCRAPER_TOKEN") ?? "";

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }
  const token = req.headers.get("x-scraper-token");
  if (!SCRAPER_TOKEN || token !== SCRAPER_TOKEN) {
    return new Response("Unauthorized", { status: 401 });
  }
  return new Response(JSON.stringify({ ok: true, received: true }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
});
