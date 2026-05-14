// apps/scraper/src/cli.ts
import { loadConfig } from "./config.js";
import { buildDeps, readScraperEnv } from "./core/deps.js";
import { runSync } from "./core/runSync.js";
import { scrapers } from "./scrapers/index.js";

function parseArgs(): { command: string; only?: string; headed: boolean; dryRun: boolean } {
  const [, , command = "", ...rest] = process.argv;
  let only: string | undefined;
  let headed = false;
  let dryRun = false;
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === "--only") only = rest[++i];
    else if (rest[i] === "--headed") headed = true;
    else if (rest[i] === "--dry-run") dryRun = true;
  }
  return { command, only, headed, dryRun };
}

async function main() {
  const args = parseArgs();
  const config = loadConfig();
  const env = readScraperEnv();

  if (args.command !== "sync") {
    console.error(`unknown command: ${args.command}`);
    process.exit(2);
  }

  const selected = args.only ? scrapers.filter((s) => s.slug === args.only) : scrapers;
  if (selected.length === 0) {
    console.error(`no scrapers matched --only=${args.only}`);
    process.exit(2);
  }

  if (args.dryRun) {
    console.log("DRY RUN — would sync:", selected.map((s) => s.slug).join(", "));
    return;
  }

  const deps = buildDeps({
    config, supabaseUrl: env.supabaseUrl,
    supabaseServiceRole: env.supabaseServiceRole, headed: args.headed,
  });

  await runSync(selected, deps);
  console.log("sync complete");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
