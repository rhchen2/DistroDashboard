import type { OrderSnapshot } from "@distro/contracts";

export interface PostOrdersArgs {
  url: string;
  token: string;
  distroSlug: string;
  syncRunId: string;
  rows: OrderSnapshot[];
}

export interface PostFailureArgs {
  url: string;
  token: string;
  distroSlug: string;
  syncRunId: string;
  error: string;
  screenshotBase64: string | null;
}

async function post(url: string, token: string, body: unknown): Promise<Response> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-scraper-token": token },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`ingest POST failed: ${res.status} ${await res.text()}`);
  }
  return res;
}

export async function postOrders(args: PostOrdersArgs): Promise<{ changed: number }> {
  const res = await post(args.url, args.token, {
    kind: "orders",
    distroSlug: args.distroSlug,
    syncRunId: args.syncRunId,
    rows: args.rows,
  });
  return (await res.json()) as { changed: number };
}

export async function postFailure(args: PostFailureArgs): Promise<void> {
  await post(args.url, args.token, {
    kind: "failure",
    distroSlug: args.distroSlug,
    syncRunId: args.syncRunId,
    error: args.error,
    screenshotBase64: args.screenshotBase64,
  });
}
