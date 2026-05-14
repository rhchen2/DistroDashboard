import { describe, expect, it, vi } from "vitest";
import { runSync } from "../src/core/runSync.js";
import type { Scraper } from "@distro/contracts";
import { makeOrderSnapshot } from "./factories.js";

function makeDeps(overrides: Partial<Parameters<typeof runSync>[1]> = {}) {
  return {
    openContext: vi.fn().mockResolvedValue({ close: vi.fn() }),
    createSyncRun: vi.fn().mockResolvedValue("sync-id-1"),
    closeSyncRun: vi.fn().mockResolvedValue(undefined),
    lastSuccessfulCount: vi.fn().mockResolvedValue(0),
    postOrders: vi.fn().mockResolvedValue({ changed: 0 }),
    postFailure: vi.fn().mockResolvedValue(undefined),
    takeScreenshot: vi.fn().mockResolvedValue("base64"),
    ...overrides,
  };
}

function fakeScraper(impl: Partial<Scraper> = {}): Scraper {
  return {
    slug: "fake",
    displayName: "Fake",
    login: vi.fn().mockResolvedValue(undefined),
    fetchOrders: vi.fn().mockResolvedValue([]),
    ...impl,
  } as Scraper;
}

describe("runSync", () => {
  it("marks run as success when scraper returns rows", async () => {
    const deps = makeDeps();
    const s = fakeScraper({ fetchOrders: vi.fn().mockResolvedValue([makeOrderSnapshot()]) });
    await runSync([s], deps);
    expect(deps.postOrders).toHaveBeenCalledOnce();
    expect(deps.closeSyncRun).toHaveBeenCalledWith(
      "sync-id-1",
      expect.objectContaining({ status: "success", ordersSeen: 1 }),
    );
  });

  it("marks run as partial when scraper returns 0 but prior > 0 (tripwire)", async () => {
    const deps = makeDeps({ lastSuccessfulCount: vi.fn().mockResolvedValue(5) });
    const s = fakeScraper({ fetchOrders: vi.fn().mockResolvedValue([]) });
    await runSync([s], deps);
    expect(deps.postOrders).not.toHaveBeenCalled();
    expect(deps.closeSyncRun).toHaveBeenCalledWith(
      "sync-id-1",
      expect.objectContaining({ status: "partial", ordersSeen: 0 }),
    );
  });

  it("marks run as success when scraper returns 0 and prior was 0", async () => {
    const deps = makeDeps({ lastSuccessfulCount: vi.fn().mockResolvedValue(0) });
    const s = fakeScraper({ fetchOrders: vi.fn().mockResolvedValue([]) });
    await runSync([s], deps);
    expect(deps.postOrders).toHaveBeenCalledOnce();
    expect(deps.closeSyncRun).toHaveBeenCalledWith(
      "sync-id-1",
      expect.objectContaining({ status: "success", ordersSeen: 0 }),
    );
  });

  it("on error, POSTs failure payload and marks run as error", async () => {
    const deps = makeDeps();
    const s = fakeScraper({
      fetchOrders: vi.fn().mockRejectedValue(new Error("login form gone")),
    });
    await runSync([s], deps);
    expect(deps.postFailure).toHaveBeenCalledOnce();
    expect(deps.closeSyncRun).toHaveBeenCalledWith(
      "sync-id-1",
      expect.objectContaining({ status: "error" }),
    );
  });

  it("processes scrapers independently — one failure does not block the next", async () => {
    let n = 0;
    const deps = makeDeps({
      createSyncRun: vi.fn().mockImplementation(async () => `run-${++n}`),
    });
    const bad = fakeScraper({
      slug: "bad",
      fetchOrders: vi.fn().mockRejectedValue(new Error("x")),
    });
    const good = fakeScraper({
      slug: "good",
      fetchOrders: vi.fn().mockResolvedValue([makeOrderSnapshot()]),
    });
    await runSync([bad, good], deps);
    expect(deps.closeSyncRun).toHaveBeenCalledTimes(2);
    expect(deps.postFailure).toHaveBeenCalledTimes(1);
    expect(deps.postOrders).toHaveBeenCalledTimes(1);
  });
});
