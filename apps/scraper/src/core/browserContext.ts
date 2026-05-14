import { chromium, type BrowserContext } from "playwright";
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export interface OpenContextArgs {
  slug: string;
  headed?: boolean;
  cookieDir?: string;
}

export async function openContext(args: OpenContextArgs): Promise<BrowserContext> {
  const cookiePath = `${args.cookieDir ?? ".cache/cookies"}/${args.slug}.json`;
  if (!existsSync(dirname(cookiePath))) {
    mkdirSync(dirname(cookiePath), { recursive: true });
  }
  const browser = await chromium.launch({ headless: !args.headed });
  const ctx = await browser.newContext({
    storageState: existsSync(cookiePath) ? cookiePath : undefined,
  });
  const originalClose = ctx.close.bind(ctx);
  ctx.close = async () => {
    try { await ctx.storageState({ path: cookiePath }); } catch { /* ignore */ }
    await originalClose();
    await browser.close();
  };
  return ctx;
}
