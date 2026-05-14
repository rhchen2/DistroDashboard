// supabase/functions/ingest/lib/revalidate.ts
const REVALIDATE_URL = Deno.env.get("REVALIDATE_URL") ?? "";
const REVALIDATE_TOKEN = Deno.env.get("REVALIDATE_TOKEN") ?? "";
const BYPASS = Deno.env.get("VERCEL_BYPASS_TOKEN") ?? "";

const TAGS = ["orders", "payments", "releases", "syncRuns"] as const;

export async function fireRevalidate(): Promise<void> {
  if (!REVALIDATE_URL || !REVALIDATE_TOKEN) {
    console.warn("Revalidate skipped — REVALIDATE_URL or REVALIDATE_TOKEN missing");
    return;
  }
  const url = new URL(REVALIDATE_URL);
  if (BYPASS) url.searchParams.set("x-vercel-protection-bypass", BYPASS);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "x-revalidate-token": REVALIDATE_TOKEN,
        "content-type": "application/json",
      },
      body: JSON.stringify({ tags: TAGS }),
    });
    if (!res.ok) {
      console.error(`Revalidate failed: ${res.status} ${await res.text()}`);
    }
  } catch (err) {
    console.error("Revalidate threw:", err);
  }
}
