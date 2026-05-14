import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

export const OrderStatusSchema = z.enum([
  "open",
  "invoiced",
  "partial_shipped",
  "shipped",
  "delivered",
  "cancelled",
]);
export type OrderStatus = z.infer<typeof OrderStatusSchema>;

export const PaymentKindSchema = z.enum(["deposit", "balance", "full", "adjustment"]);
export type PaymentKind = z.infer<typeof PaymentKindSchema>;

const ItemSchema = z.object({
  sku: z.string().nullable(),
  productName: z.string(),
  qty: z.number().int().positive(),
  unitCostCents: z.number().int().nonnegative(),
  releaseDate: isoDate.nullable(),
});

const PaymentSchema = z.object({
  kind: PaymentKindSchema,
  expectedDate: isoDate.nullable(),
  expectedCents: z.number().int(),
  actualDate: isoDate.nullable(),
  actualCents: z.number().int().nullable(),
});

const ShipmentItemSchema = z.object({
  sku: z.string().nullable(),
  qty: z.number().int().positive(),
});

const ShipmentSchema = z.object({
  shippedAt: isoDate,
  tracking: z.string().nullable(),
  carrier: z.string().nullable(),
  items: z.array(ShipmentItemSchema),
});

export const OrderSnapshotSchema = z.object({
  distroOrderId: z.string().min(1),
  placedAt: isoDate,
  status: OrderStatusSchema,
  totals: z.object({
    subtotalCents: z.number().int(),
    taxCents: z.number().int(),
    shippingCents: z.number().int(),
    totalCents: z.number().int(),
  }),
  items: z.array(ItemSchema),
  payments: z.array(PaymentSchema),
  shipments: z.array(ShipmentSchema),
  rawPayload: z.unknown(),
});
export type OrderSnapshot = z.infer<typeof OrderSnapshotSchema>;
