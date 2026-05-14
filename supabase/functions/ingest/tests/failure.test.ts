// supabase/functions/ingest/tests/failure.test.ts
import { assertEquals, assertExists } from "https://deno.land/std@0.220.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { handleFailure } from "../handlers/failure.ts";

const SUPA_URL = Deno.env.get("SUPABASE_URL") ?? "http://127.0.0.1:54321";
const SVC = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

Deno.test({ name: "handleFailure updates sync_run with error + uploads screenshot", sanitizeOps: false, sanitizeResources: false, fn: async () => {
  const c = createClient(SUPA_URL, SVC, { auth: { persistSession: false } });
  const { data: distro } = await c.from("distros").select("id").eq("slug", "gts").single();

  const { data: run } = await c.from("sync_runs").insert({
    distro_id: distro!.id, status: "running",
  }).select("id").single();

  // 1x1 transparent PNG (base64)
  const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

  await handleFailure(c, {
    kind: "failure",
    distroSlug: "gts",
    syncRunId: run!.id,
    error: "Login form not found",
    screenshotBase64: png,
  });

  const { data: updated } = await c.from("sync_runs").select("*").eq("id", run!.id).single();
  assertEquals(updated!.status, "error");
  assertEquals(updated!.error_message, "Login form not found");
  assertExists(updated!.screenshot_url);
  assertExists(updated!.finished_at);

  // cleanup
  await c.from("sync_runs").delete().eq("id", run!.id);
}});
