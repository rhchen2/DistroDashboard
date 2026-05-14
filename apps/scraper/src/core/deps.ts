// apps/scraper/src/core/deps.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import type { BrowserContext } from "playwright";
import { openContext as openCtx } from "./browserContext.js";
import { postOrders, postFailure } from "./ingestClient.js";
import type { Config } from "../config.js";
import type { RunSyncDeps } from "./runSync.js";

// We need a Supabase client to write sync_runs from the local side, since the
// orchestrator owns the sync_run lifecycle (create at start, close at end).
// The ingest function ALSO updates sync_runs (orders_seen/changed on success,
// status=error on failure). They write to non-overlapping fields except status,
// which the ingest function overrides at the end of its run.

export interface BuildDepsArgs {
  config: Config;
  supabaseUrl: string;
  supabaseServiceRole: string;
  headed?: boolean;
}

export function buildDeps(args: BuildDepsArgs): RunSyncDeps {
  const supa = createClient(args.supabaseUrl, args.supabaseServiceRole, {
    auth: { persistSession: false },
  });

  return {
    openContext: async (slug) => {
      const ctx = await openCtx({ slug, headed: args.headed });
      return Object.assign(ctx as unknown as Record<string, unknown>, {
        close: () => ctx.close(),
      }) as any;
    },

    createSyncRun: async (slug) => {
      const { data: d } = await supa.from("distros").select("id").eq("slug", slug).single();
      if (!d) throw new Error(`distro not seeded: ${slug}`);
      const { data: run, error } = await supa.from("sync_runs").insert({
        distro_id: d.id, status: "running",
      }).select("id").single();
      if (error || !run) throw new Error(`create sync_run failed: ${error?.message}`);
      return run.id;
    },

    closeSyncRun: async (syncRunId, closeArgs) => {
      await supa.from("sync_runs").update({
        status: closeArgs.status,
        orders_seen: closeArgs.ordersSeen,
        orders_changed: closeArgs.ordersChanged,
        error_message: closeArgs.errorMessage,
        finished_at: new Date().toISOString(),
      }).eq("id", syncRunId);
    },

    lastSuccessfulCount: async (slug) => {
      const { data: d } = await supa.from("distros").select("id").eq("slug", slug).single();
      if (!d) return null;
      const { data: run } = await supa.from("sync_runs").select("orders_seen")
        .eq("distro_id", d.id).eq("status", "success")
        .order("finished_at", { ascending: false }).limit(1).maybeSingle();
      return run?.orders_seen ?? null;
    },

    postOrders: async (a) => postOrders({
      url: args.config.ingestUrl,
      token: args.config.scraperToken,
      distroSlug: a.distroSlug,
      syncRunId: a.syncRunId,
      rows: a.rows,
    }),

    postFailure: async (a) => postFailure({
      url: args.config.ingestUrl,
      token: args.config.scraperToken,
      distroSlug: a.distroSlug,
      syncRunId: a.syncRunId,
      error: a.error,
      screenshotBase64: a.screenshotBase64,
    }),

    takeScreenshot: async (ctx) => {
      // ctx is a Playwright BrowserContext at runtime
      try {
        const pages = (ctx as unknown as BrowserContext).pages();
        const page = pages[0];
        if (!page) return null;
        const buf = await page.screenshot({ type: "png" });
        return buf.toString("base64");
      } catch {
        return null;
      }
    },
  };
}

// Local helper: read service role key + URL from a .env.local file in the scraper.
// Kept here to avoid pulling in dotenv.
export function readScraperEnv(path = "apps/scraper/.env.local"): {
  supabaseUrl: string;
  supabaseServiceRole: string;
} {
  const raw = readFileSync(path, "utf8");
  const env: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m) env[m[1]!] = m[2]!.replace(/^"(.*)"$/, "$1");
  }
  return {
    supabaseUrl: env["SUPABASE_URL"] ?? "",
    supabaseServiceRole: env["SUPABASE_SERVICE_ROLE_KEY"] ?? "",
  };
}
