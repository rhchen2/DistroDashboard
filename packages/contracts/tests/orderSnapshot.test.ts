// packages/contracts/tests/orderSnapshot.test.ts
import { describe, expect, it } from "vitest";
import { OrderSnapshotSchema } from "../src/index.js";

describe("OrderSnapshotSchema", () => {
  const validSnapshot = {
    distroOrderId: "PO-44821",
    placedAt: "2026-04-12",
    status: "invoiced",
    totals: {
      subtotalCents: 124000,
      taxCents: 0,
      shippingCents: 1500,
      totalCents: 125500,
    },
    items: [
      {
        sku: "OP-12-BOX",
        productName: "One Piece OP-12 Booster Box",
        qty: 6,
        unitCostCents: 20000,
        releaseDate: "2026-06-07",
      },
    ],
    payments: [
      {
        kind: "deposit",
        expectedDate: "2026-04-15",
        expectedCents: 50000,
        actualDate: null,
        actualCents: null,
      },
    ],
    shipments: [],
    rawPayload: { source: "test" },
  };

  it("accepts a fully-populated valid snapshot", () => {
    const parsed = OrderSnapshotSchema.parse(validSnapshot);
    expect(parsed.distroOrderId).toBe("PO-44821");
  });

  it("rejects missing distroOrderId", () => {
    const { distroOrderId: _, ...bad } = validSnapshot;
    expect(() => OrderSnapshotSchema.parse(bad)).toThrow();
  });

  it("rejects invalid status enum", () => {
    expect(() =>
      OrderSnapshotSchema.parse({ ...validSnapshot, status: "unknown_state" }),
    ).toThrow();
  });

  it("rejects malformed date string", () => {
    expect(() =>
      OrderSnapshotSchema.parse({ ...validSnapshot, placedAt: "April 12 2026" }),
    ).toThrow();
  });

  it("requires payment.expectedCents to be a number", () => {
    expect(() =>
      OrderSnapshotSchema.parse({
        ...validSnapshot,
        payments: [{ ...validSnapshot.payments[0], expectedCents: "fifty" }],
      }),
    ).toThrow();
  });

  it("accepts empty items, payments, shipments arrays", () => {
    expect(() =>
      OrderSnapshotSchema.parse({
        ...validSnapshot,
        items: [],
        payments: [],
        shipments: [],
      }),
    ).not.toThrow();
  });

  it("allows null for nullable date fields on items and payments", () => {
    expect(() =>
      OrderSnapshotSchema.parse({
        ...validSnapshot,
        items: [{ ...validSnapshot.items[0], releaseDate: null, sku: null }],
        payments: [{ ...validSnapshot.payments[0], expectedDate: null }],
      }),
    ).not.toThrow();
  });
});
