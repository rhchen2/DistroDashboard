// supabase/functions/ingest/handlers/failure.ts
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import type { IngestFailurePayload } from "@distro/contracts";

const BUCKET = "sync-debug";

export async function handleFailure(
  c: SupabaseClient,
  payload: IngestFailurePayload,
): Promise<void> {
  let screenshotUrl: string | null = null;

  if (payload.screenshotBase64) {
    await c.storage.createBucket(BUCKET, { public: false }).catch(() => undefined);

    const path = `${payload.distroSlug}/${payload.syncRunId}.png`;
    const bytes = Uint8Array.from(atob(payload.screenshotBase64), (ch) => ch.charCodeAt(0));

    const { error: upErr } = await c.storage.from(BUCKET).upload(path, bytes, {
      contentType: "image/png",
      upsert: true,
    });
    if (upErr) throw new Error(`screenshot upload failed: ${upErr.message}`);

    const { data: signed } = await c.storage.from(BUCKET).createSignedUrl(path, 60 * 60 * 24 * 30);
    screenshotUrl = signed?.signedUrl ?? null;
  }

  const { error: updErr } = await c.from("sync_runs").update({
    status: "error",
    error_message: payload.error,
    screenshot_url: screenshotUrl,
    finished_at: new Date().toISOString(),
  }).eq("id", payload.syncRunId);
  if (updErr) throw new Error(`sync_runs update failed: ${updErr.message}`);
}
