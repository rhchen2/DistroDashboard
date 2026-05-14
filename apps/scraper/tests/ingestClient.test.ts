import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { postOrders, postFailure } from "../src/core/ingestClient.js";
import type { OrderSnapshot } from "@distro/contracts";

const URL = "http://example.com/ingest";
const TOKEN = "tok";

const fakeSnapshot: OrderSnapshot = {
  distroOrderId: "PO-1",
  placedAt: "2026-04-12",
  status: "open",
  totals: { subtotalCents: 0, taxCents: 0, shippingCents: 0, totalCents: 0 },
  items: [], payments: [], shipments: [], rawPayload: null,
};

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => vi.unstubAllGlobals());

describe("postOrders", () => {
  it("POSTs payload with x-scraper-token header", async () => {
    (fetch as any).mockResolvedValue(new Response(JSON.stringify({ changed: 1 }), { status: 200 }));
    const runId = "00000000-0000-4000-8000-000000000001";
    await postOrders({
      url: URL, token: TOKEN, distroSlug: "gts", syncRunId: runId, rows: [fakeSnapshot],
    });

    expect(fetch).toHaveBeenCalledOnce();
    const [calledUrl, init] = (fetch as any).mock.calls[0];
    expect(calledUrl).toBe(URL);
    expect((init as RequestInit).method).toBe("POST");
    expect((init as RequestInit).headers).toMatchObject({ "x-scraper-token": TOKEN });
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.kind).toBe("orders");
    expect(body.rows.length).toBe(1);
  });

  it("throws on non-2xx response", async () => {
    (fetch as any).mockResolvedValue(new Response("nope", { status: 422 }));
    await expect(postOrders({
      url: URL, token: TOKEN, distroSlug: "gts",
      syncRunId: "00000000-0000-4000-8000-000000000001", rows: [],
    })).rejects.toThrow(/422/);
  });
});

describe("postFailure", () => {
  it("POSTs failure payload", async () => {
    (fetch as any).mockResolvedValue(new Response("{}", { status: 200 }));
    await postFailure({
      url: URL, token: TOKEN, distroSlug: "gts",
      syncRunId: "00000000-0000-4000-8000-000000000001",
      error: "boom", screenshotBase64: "abc",
    });
    expect(fetch).toHaveBeenCalledOnce();
    const body = JSON.parse((fetch as any).mock.calls[0][1].body);
    expect(body.kind).toBe("failure");
    expect(body.error).toBe("boom");
    expect(body.screenshotBase64).toBe("abc");
  });
});
