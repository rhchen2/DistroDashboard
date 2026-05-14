import { describe, expect, it } from "vitest";
import { IngestPayloadSchema } from "../src/index.js";

const validUuid = "00000000-0000-4000-8000-000000000001";

describe("IngestPayloadSchema", () => {
  it("accepts an orders payload", () => {
    const p = { kind: "orders", distroSlug: "gts", syncRunId: validUuid, rows: [] };
    expect(() => IngestPayloadSchema.parse(p)).not.toThrow();
  });

  it("accepts a failure payload with screenshot", () => {
    const p = {
      kind: "failure",
      distroSlug: "gts",
      syncRunId: validUuid,
      error: "Login form not found",
      screenshotBase64: "iVBORw0KGgo=",
    };
    expect(() => IngestPayloadSchema.parse(p)).not.toThrow();
  });

  it("rejects unknown kind", () => {
    expect(() =>
      IngestPayloadSchema.parse({ kind: "weird", distroSlug: "gts" }),
    ).toThrow();
  });

  it("rejects non-UUID syncRunId", () => {
    expect(() =>
      IngestPayloadSchema.parse({
        kind: "orders",
        distroSlug: "gts",
        syncRunId: "not-a-uuid",
        rows: [],
      }),
    ).toThrow();
  });
});
